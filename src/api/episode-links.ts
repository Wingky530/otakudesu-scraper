import type { APIRoute } from 'astro';
import { ALLANIME_API, AGENT, REFERER, decryptSourceUrl, decryptPayload } from '../../../lib/allanime';
import { getCache, setCache } from '../../../lib/anime-cache';
import { markCacheIndex } from '../../../lib/cache-index';
import * as cheerio from 'cheerio';
import { fetchEmbed, extractVidhide, extractFiledon, extractDesustream, extractYourUpload } from '../../../lib/embed-extract';

export const prerender = false;
export const maxDuration = 30;

interface Source {
  sourceName?: string;
  type?: string;
  decodedPath?: string;
  directLinks?: any[];
}

interface ScrapedSource {
  sourceName: string;
  url: string;
  directLinks?: string[];
  type?: string;
}

function getRawSimilarity(s1: string, s2: string): number {
  let longer = s1.toLowerCase();
  let shorter = s2.toLowerCase();
  if (longer.length < shorter.length) {
    let temp = longer;
    longer = shorter;
    shorter = temp;
  }
  let longerLength = longer.length;
  if (longerLength === 0) return 1.0;
  
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return (longerLength - costs[s2.length]) / longerLength;
}

function getSimilarity(s1: string, s2: string): number {
  let sim = getRawSimilarity(s1, s2);
  
  const hasSeason1 = s1.toLowerCase().includes('season') || !!s1.toLowerCase().match(/\bs\d+/);
  const hasSeason2 = s2.toLowerCase().includes('season') || !!s2.toLowerCase().match(/\bs\d+/);
  if (hasSeason1 !== hasSeason2) {
    sim -= 0.3;
  }

  const hasPart1 = s1.toLowerCase().includes('part') || !!s1.toLowerCase().match(/\bp\d+/);
  const hasPart2 = s2.toLowerCase().includes('part') || !!s2.toLowerCase().match(/\bp\d+/);
  if (hasPart1 !== hasPart2) {
    sim -= 0.3;
  }
  
  return sim;
}
async function fetchWithRetry(url: string, init: RequestInit = {}, retries = 3, backoff = 500): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    
    // Log details of the failure to help debug 403/502/etc.
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      try {
        const text = await res.clone().text();
        console.error(`[fetchWithRetry] Failed request to: ${url} | Status: ${res.status} | Body snippet:`, text.slice(0, 1000));
      } catch (e) {
        // ignore
      }
    }

    // Retry on transient errors
    if ([403, 429, 502, 503, 504].includes(res.status) && attempt < retries) {
      const delay = backoff * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
      attempt++;
      continue;
    }
    throw new Error(`Fetch failed: HTTP ${res.status}`);
  }
}


async function scrapeOtakudesu(title: string, episode: string): Promise<ScrapedSource[]> {
  const baseUrl = 'https://otakudesu.blog';
  const cleanTitle = title.replace(/^#\d+\s+/, '').trim();
  const searchTitle = cleanTitle
    .replace(/((?:Season\s+\d+|\d+(?:th|nd|rd|st)\s+Season))\s*:.*$/i, '$1')
    .replace(/(\d+)(?:th|nd|rd|st)\s+Season/gi, 'Season $1')
    .trim();

  const proxyUrl = 'https://cerydra-video-proxy.wingky530-id.workers.dev/?url=';
  const targetSearch = `${baseUrl}/?s=${encodeURIComponent(searchTitle)}`;
  const searchRes = await fetchWithRetry(`${proxyUrl}${encodeURIComponent(targetSearch)}`, {
    headers: { 'User-Agent': 'Cerydra-Backend/1.0' }
  });
  if (!searchRes.ok) throw new Error(`Search failed: HTTP ${searchRes.status}`);
  const searchHtml = await searchRes.text();
  let $ = cheerio.load(searchHtml);

  const searchResults: { title: string; url: string }[] = [];
  $('ul.chivsrc li').each((i, li) => {
    const a = $(li).find('h2 a');
    if (a.length) {
      searchResults.push({
        title: a.text().trim(),
        url: a.attr('href') || ''
      });
    }
  });

  if (searchResults.length === 0) {
    return [];
  }

  let bestMatch = searchResults[0];
  let maxSim = -999;
  for (const r of searchResults) {
    const sim = getSimilarity(cleanTitle, r.title);
    if (sim > maxSim) {
      maxSim = sim;
      bestMatch = r;
    }
  }

  let animeUrl = bestMatch.url;
  if (!animeUrl.includes('/anime/')) {
    const epRes = await fetchWithRetry(`${proxyUrl}${encodeURIComponent(animeUrl)}`, { headers: { 'User-Agent': 'Cerydra-Backend/1.0' } });
    if (!epRes.ok) throw new Error(`Intermediate episode page failed: HTTP ${epRes.status}`);
    const epHtml = await epRes.text();
    const $ep = cheerio.load(epHtml);
    let foundAnimeUrl = '';
    $ep('a').each((i, a) => {
      const href = $ep(a).attr('href') || '';
      if (href.includes('/anime/')) {
        foundAnimeUrl = href;
      }
    });
    if (foundAnimeUrl) {
      animeUrl = foundAnimeUrl;
    } else {
      return [];
    }
  }

  const animeRes = await fetchWithRetry(`${proxyUrl}${encodeURIComponent(animeUrl)}`, { headers: { 'User-Agent': 'Cerydra-Backend/1.0' } });
  if (!animeRes.ok) throw new Error(`Anime page failed: HTTP ${animeRes.status}`);
  const animeHtml = await animeRes.text();
  $ = cheerio.load(animeHtml);

  const episodes: { epText: string; url: string }[] = [];
  $('.episodelist ul li').each((i, li) => {
    const a = $(li).find('span a');
    if (a.length) {
      episodes.push({
        epText: a.text().trim(),
        url: a.attr('href') || ''
      });
    }
  });

  let targetEp = episodes.find(ep => {
    const numMatch = ep.epText.match(/Episode\s+(\d+)/i);
    if (numMatch) {
      return parseInt(numMatch[1], 10) === parseInt(episode, 10);
    }
    return false;
  });

  if (!targetEp) {
    const paddedEp = episode.padStart(2, '0');
    targetEp = episodes.find(ep => 
      ep.epText.includes(`Episode ${episode}`) || 
      ep.epText.includes(`Episode ${paddedEp}`) || 
      ep.epText.endsWith(` ${episode}`) ||
      ep.epText.endsWith(` ${paddedEp}`)
    );
  }

  if (!targetEp) {
    return [];
  }

  const epRes = await fetchWithRetry(`${proxyUrl}${encodeURIComponent(targetEp.url)}`, { headers: { 'User-Agent': 'Cerydra-Backend/1.0' } });
  if (!epRes.ok) throw new Error(`Episode page failed: HTTP ${epRes.status}`);
  const epHtml = await epRes.text();
  $ = cheerio.load(epHtml);

  const mirrorLinks: { name: string; quality: string; content: string }[] = [];
  $('.mirrorstream ul li a').each((i, a) => {
    const parentUl = $(a).closest('ul');
    let quality = '360p';
    if (parentUl.length) {
      const classes = parentUl.attr('class') || '';
      const qMatch = classes.split(' ').find(c => c.startsWith('m') && c.endsWith('p'));
      if (qMatch) quality = qMatch.substring(1);
    }
    mirrorLinks.push({
      name: $(a).text().trim(),
      quality: quality,
      content: $(a).attr('data-content') || ''
    });
  });

  const results: ScrapedSource[] = [];
  const episodeReferer = targetEp?.url || '';

  const defaultIframe = $('#pembed iframe').length ? $('#pembed iframe') : $('.player-embed iframe');
  if (defaultIframe.length && defaultIframe.attr('src')) {
    let url = defaultIframe.attr('src') || '';
    if (url.startsWith('//')) url = 'https:' + url;
    let name = 'Default';
    if (url.includes('ok.ru')) name = 'Ok';
    else if (url.includes('mp4upload')) name = 'Mp4';
    else if (url.includes('streamwish')) name = 'Sw';

    let directLinks: string[] | undefined = undefined;
    let type: string | undefined = undefined;

    const isVidhide = url.includes('vidhide') || url.includes('earnvid') || url.includes('odvidhide');
    const isFiledon = url.includes('filedon');
    const isDesustream = url.includes('desustream') || url.includes('/dstream/') || url.includes('desudrive.com') || url.includes('desustream.info');
    const isYourupload = url.includes('yourupload.com') || url.includes('yuplod.php');

    if (isVidhide || isFiledon || isDesustream || isYourupload) {
      try {
        console.log(`[Otakudesu Scraper] Resolving direct link for default iframe: ${url}`);
        let directUrl: string | null = null;
        
        if (isYourupload) {
          directUrl = await extractYourUpload(url);
        } else {
          const embedHtml = await fetchEmbed(url, undefined, episodeReferer);
          if (isVidhide) {
            directUrl = extractVidhide(embedHtml, url);
          } else if (isFiledon) {
            directUrl = extractFiledon(embedHtml);
          } else {
            directUrl = extractDesustream(embedHtml);
          }
        }

        if (directUrl) {
          directLinks = [directUrl];
          type = isVidhide ? 'hls' : 'player';
        }
      } catch (e: any) {
        console.error(`[Otakudesu Scraper] Error extracting default iframe direct link:`, e.message);
      }
    }

    results.push({ sourceName: name, url, directLinks, type });
  }

  const callAjax = async (action: string, data: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    params.append('action', action);
    for (const [key, value] of Object.entries(data)) {
      params.append(key, value);
    }
    const targetUrl = `${baseUrl}/wp-admin/admin-ajax.php`;
    const proxyTarget = `${proxyUrl}${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(targetEp!.url)}`;

    // Retry on 403 (Forbidden) which can happen due to intermittent WAF blocks
    const maxAttempts = 3;
    let attempt = 0;
    let response;
    while (attempt < maxAttempts) {
      response = await fetchWithRetry(proxyTarget, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Cerydra-Backend/1.0',
          'Referer': targetEp!.url
        },
        body: params.toString()
      });
      if (response.ok) break;
      if (response.status !== 403) break; // only retry on 403
      attempt++;
      console.warn(`[Otakudesu Scraper] Ajax POST 403, retrying (${attempt}/${maxAttempts})...`);
    }
    if (!response || !response.ok) throw new Error(`Ajax POST failed: HTTP ${response ? response.status : 'unknown'}`);
    const result = await response.json();
    return result.data;
  };

  try {
    const nonce = await callAjax('aa1208d27f29ca340c92c66d1926f13f');
    if (nonce) {
      const promises = mirrorLinks.map(async (link) => {
        try {
          const payload = JSON.parse(Buffer.from(link.content, 'base64').toString('utf-8'));
          const resData = await callAjax('2a3505c93b0035d3f455df82bf976b84', {
            ...payload,
            nonce: nonce
          });
          if (resData) {
            const decodedHtml = Buffer.from(resData, 'base64').toString('utf-8');
            const match = decodedHtml.match(/src="([^"]+)"/i);
            if (match) {
              let url = match[1];
              if (url.startsWith('//')) url = 'https:' + url;
              
              let name = link.name;
              if (url.includes('ok.ru')) name = 'Ok';
              else if (url.includes('mp4upload')) name = 'Mp4';
              else if (url.includes('streamwish')) name = 'Sw';

              let directLinks: string[] | undefined = undefined;
              let type: string | undefined = undefined;

              const isVidhide = url.includes('vidhide') || url.includes('earnvid') || url.includes('odvidhide');
              const isFiledon = url.includes('filedon');
              const isDesustream = url.includes('desustream') || url.includes('/dstream/') || url.includes('desudrive.com') || url.includes('desustream.info');
              const isYourupload = url.includes('yourupload.com') || url.includes('yuplod.php');

              if (isVidhide || isFiledon || isDesustream || isYourupload) {
                try {
                  console.log(`[Otakudesu Scraper] Resolving direct link for: ${name} from ${url}`);
                  let directUrl: string | null = null;
                  
                  if (isYourupload) {
                    directUrl = await extractYourUpload(url);
                  } else {
                    const embedHtml = await fetchEmbed(url, undefined, episodeReferer);
                    if (isVidhide) {
                      directUrl = extractVidhide(embedHtml, url);
                    } else if (isFiledon) {
                      directUrl = extractFiledon(embedHtml);
                    } else {
                      directUrl = extractDesustream(embedHtml);
                    }
                  }

                  if (directUrl) {
                    console.log(`[Otakudesu Scraper] Successfully extracted direct link: ${directUrl.slice(0, 80)}...`);
                    directLinks = [directUrl];
                    type = isVidhide ? 'hls' : 'player';
                  } else {
                    console.warn(`[Otakudesu Scraper] Failed to extract direct link for: ${name} from ${url}`);
                  }
                } catch (e: any) {
                  console.error(`[Otakudesu Scraper] Error extracting direct link for ${name}:`, e.message);
                }
              }

              return {
                sourceName: `${name} (${link.quality})`,
                url,
                directLinks,
                type
              };
            }
          }
        } catch (e: any) {
          console.error(`[Otakudesu Scraper] Failed to resolve mirror ${link.name}:`, e.message);
        }
        return null;
      });

      const resolved = await Promise.all(promises);
      for (const res of resolved) {
        if (res) results.push(res);
      }
    }
  } catch (err: any) {
    console.error('[Otakudesu Scraper] Error resolving mirrors:', err.message);
  }

  return results;
}

async function resolveMegaPlay(anilistId: string, episode: string, mode: string) {
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const lang = mode === 'dub' ? 'dub' : 'sub';
  const embedUrl = `https://megaplay.buzz/stream/ani/${anilistId}/${episode}/${lang}`;

  try {
    console.log(`[resolveMegaPlay] Fetching embed page: ${embedUrl}`);
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': userAgent,
        'Referer': 'https://hianime.biz.pl/',
      }
    });

    if (!res.ok) {
      console.warn(`[resolveMegaPlay] Page fetch returned status ${res.status}`);
      return null;
    }

    const html = await res.text();
    if (!html) return null;
    
    const $ = cheerio.load(html);
    const playerDiv = $('#megaplay-player');
    const dataId = playerDiv.attr('data-id');

    if (!dataId) {
      console.warn(`[resolveMegaPlay] data-id not found in HTML`);
      return null;
    }

    const sourcesUrl = `https://megaplay.buzz/stream/getSources?id=${dataId}`;
    console.log(`[resolveMegaPlay] Fetching sources: ${sourcesUrl}`);
    const sourcesRes = await fetch(sourcesUrl, {
      headers: {
        'User-Agent': userAgent,
        'Referer': embedUrl,
        'X-Requested-With': 'XMLHttpRequest',
      }
    });

    if (!sourcesRes.ok) {
      console.warn(`[resolveMegaPlay] Sources fetch returned status ${sourcesRes.status}`);
      return null;
    }

    const data = await sourcesRes.json();
    return data;
  } catch (err: any) {
    console.error(`[resolveMegaPlay] Error:`, err.message);
    return null;
  }
}

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const episode = url.searchParams.get('episode');
  const mode = url.searchParams.get('mode') || 'sub';
  const anilistId = url.searchParams.get('anilistId');

  if (!id || !episode) {
    return new Response(JSON.stringify({ error: 'Parameters id and episode are required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nocache = url.searchParams.get('nocache') === '1' || url.searchParams.get('nocache') === 'true';

  const cacheKey = `episode-links:v4:${id}:${episode}:${mode}`;
  if (!nocache) {
    const cached = await getCache<any>(cacheKey, mode === 'sub-id' ? 1800000 : 90000);
    if (cached) {
      const isEmpty = !cached.sources || cached.sources.length === 0;
      if (!isEmpty) {
        return new Response(JSON.stringify(cached), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      console.log(`[episode-links] Cache is empty, bypassing for: ${cacheKey}`);
    }
  }

  const query = `
    query($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) {
      episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) {
        show {
          name
          description
          thumbnail
        }
        sourceUrls
      }
    }
  `;

  try {
    let megaPlayData: any = null;
    let allAnimeResponse: any = null;

    const promises: Promise<any>[] = [];

    // Promise 1: AllAnime query (always run as fallback)
    promises.push(
      fetchWithRetry(ALLANIME_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': AGENT,
          'Referer': REFERER,
          'Origin': REFERER
        },
        body: JSON.stringify({
          variables: { showId: id, translationType: mode === 'sub-id' ? 'sub' : mode, episodeString: episode },
          query
        })
      }).then(async (res) => {
        if (!res.ok) {
          console.error(`[episode-links] AllAnime fetch returned HTTP ${res.status}`);
          return null;
        }
        return res.json();
      }).catch(err => {
        console.error('[episode-links] AllAnime fetch failed:', err.message);
        return null;
      })
    );

    // Promise 2: MegaPlay resolver (if anilistId is present)
    let megaPlayPromise = null;
    if (anilistId) {
      const megaPlayMode = mode === 'sub-id' ? 'sub' : mode;
      megaPlayPromise = resolveMegaPlay(anilistId, episode, megaPlayMode).catch(err => {
        console.error('[episode-links] MegaPlay resolver error:', err.message);
        return null;
      });
      promises.push(megaPlayPromise);
    }

    const pResults = await Promise.all(promises);
    allAnimeResponse = pResults[0];
    if (anilistId) {
      megaPlayData = pResults[1];
    }

    const responseData = allAnimeResponse?.data;

    const sources: any[] = [];
    let title = '';
    let synopsis = '';
    let episodeSynopsis = '';
    let thumbnail = '';

    if (responseData?.tobeparsed) {
      const decrypted = decryptPayload(responseData.tobeparsed);
      try {
        const parsed = JSON.parse(decrypted);
        const episodeObj = parsed.episode;

        if (episodeObj) {
          title = episodeObj.show?.name || '';
          synopsis = episodeObj.show?.description || '';
          episodeSynopsis = episodeObj.episodeInfo?.description || '';
          thumbnail = episodeObj.show?.thumbnail || '';
          if (Array.isArray(episodeObj.sourceUrls)) {
            sources.push(...episodeObj.sourceUrls);
          }
        } else if (parsed.sourceUrls) {
          if (Array.isArray(parsed.sourceUrls)) {
            sources.push(...parsed.sourceUrls);
          }
        } else if (Array.isArray(parsed)) {
          sources.push(...parsed);
        } else {
          sources.push(parsed);
        }
      } catch {
        const regex = /"sourceUrl"\s*:\s*"([^"]+)"\s*,\s*"sourceName"\s*:\s*"([^"]+)"/g;
        let match;
        while ((match = regex.exec(decrypted)) !== null) {
          sources.push({ sourceUrl: match[1], sourceName: match[2] });
        }
      }
    } else if (responseData?.episode?.sourceUrls) {
      title = responseData.episode.show?.name || '';
      synopsis = responseData.episode.show?.description || '';
      episodeSynopsis = responseData.episode.episodeInfo?.description || '';
      thumbnail = responseData.episode.show?.thumbnail || '';

      for (const source of responseData.episode.sourceUrls) {
        if (source.tobeparsed) {
          const decrypted = decryptPayload(source.tobeparsed);
          try {
            const parsed = JSON.parse(decrypted);
            if (Array.isArray(parsed)) {
              sources.push(...parsed);
            } else {
              sources.push(parsed);
            }
          } catch {
            const regex = /"sourceUrl"\s*:\s*"([^"]+)"\s*,\s*"sourceName"\s*:\s*"([^"]+)"/g;
            let match;
            while ((match = regex.exec(decrypted)) !== null) {
              sources.push({ sourceUrl: match[1], sourceName: match[2] });
            }
          }
        } else {
          sources.push(source);
        }
      }
    }

    if (responseData?.episode?.show?.name && !title) {
      title = responseData.episode.show.name;
    }
    if (responseData?.episode?.show?.description && !synopsis) {
      synopsis = responseData.episode.show.description;
    }
    if (responseData?.episode?.episodeInfo?.description && !episodeSynopsis) {
      episodeSynopsis = responseData.episode.episodeInfo.description;
    }
    if (responseData?.episode?.show?.thumbnail && !thumbnail) {
      thumbnail = responseData.episode.show.thumbnail;
    }

    if (!title && !anilistId) {
      try {
        console.log(`[episode-links] Title is empty. Fetching fallback show details for ID: ${id}`);
        const showRes = await fetchWithRetry(ALLANIME_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': AGENT,
            'Referer': REFERER,
            'Origin': REFERER
          },
          body: JSON.stringify({
            variables: { showId: id },
            query: `
              query($showId: String!) {
                show(_id: $showId) {
                  name
                  thumbnail
                  description
                }
              }
            `
          })
        });
        if (showRes.ok) {
          const showData = await showRes.json();
          const showObj = showData?.data?.show;
          if (showObj) {
            title = showObj.name || '';
            thumbnail = showObj.thumbnail || '';
            synopsis = showObj.description || '';
            console.log(`[episode-links] Fallback show query resolved title: ${title}`);
          }
        }
      } catch (err: any) {
        console.error(`[episode-links] Fallback show query failed:`, err.message);
      }
    }

    if (!title && anilistId) {
      try {
        console.log(`[episode-links] Title is empty. Fetching fallback show details from AniList ID: ${anilistId}`);
        const aniRes = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query($id: Int) {
              Media(id: $id, type: ANIME) {
                title { english romaji }
                description
                coverImage { extraLarge }
              }
            }`,
            variables: { id: parseInt(anilistId, 10) }
          })
        });
        if (aniRes.ok) {
          const json = await aniRes.json();
          const media = json?.data?.Media;
          if (media) {
            title = media.title.english || media.title.romaji || '';
            synopsis = media.description || '';
            thumbnail = media.coverImage?.extraLarge || '';
            console.log(`[episode-links] Fallback AniList query resolved title: ${title}`);
          }
        }
      } catch (err: any) {
        console.error('[episode-links] Failed to resolve metadata from AniList fallback:', err.message);
      }
    }

    if (mode === 'sub-id' && title) {
      console.log(`[episode-links] Mode is sub-id. Fetching Indonesian sources directly for: ${title}`);
      sources.length = 0;

      try {
        const scraped = await scrapeOtakudesu(title, episode);
        for (const hfSrc of scraped) {
          sources.push({
            sourceName: hfSrc.sourceName,
            sourceUrl: hfSrc.url,
            type: hfSrc.type || (hfSrc.url.includes('hls') || hfSrc.sourceName.toLowerCase().includes('hls') ? 'hls' : 'iframe'),
            directLinks: hfSrc.directLinks
          });
        }
      } catch (err: any) {
        console.error(`[episode-links] Direct scraper failed:`, err.message);
      }
    }

    // Resolve sources: decrypt source URLs, fetch clock.json for direct links
    const resolvedSources: Source[] = [];

    for (const src of sources) {
      if (!src || !src.sourceUrl) continue;

      const decodedPath = decryptSourceUrl(src.sourceUrl);
      const isClockLink = decodedPath.includes('/clock.json');

      if (isClockLink) {
        // S-mp4: Worker handles clock.json resolve (IP matching)
        resolvedSources.push({
          sourceName: src.sourceName || 'S-mp4',
          type: 's-mp4',
          decodedPath,
          directLinks: [],
        });
        continue;
      }

      let type = src.type;
      if (!type || (type !== 'player' && type !== 'hls')) {
        if (src.sourceName?.toLowerCase().includes('hls')) type = 'hls';
        else type = 'iframe';
      }

      // Only keep S-mp4 (handled above), Ok, Mp4, or player-type sources
      // For sub-id, we keep all sources scraped from the target site
      const isOkOrMp4 = src.sourceName === 'Ok' || src.sourceName === 'Mp4';
      const isPlayer = type === 'player';

      if (isOkOrMp4 || isPlayer || mode === 'sub-id') {
        resolvedSources.push({
          sourceName: src.sourceName,
          type: type,
          decodedPath,
          directLinks: src.directLinks || [],
        });
      }
    }

    if (megaPlayData && megaPlayData.sources?.file) {
      const fileUrl = megaPlayData.sources.file;
      if (mode === 'sub' || mode === 'dub') {
        const mappedTracks = megaPlayData.tracks?.map((t: any) => ({
          src: t.file.includes('.vtt') || t.file.includes('.srt') 
            ? `/api/anime/subtitle?url=${encodeURIComponent(t.file)}` 
            : t.file,
          label: t.label,
          kind: t.kind || 'captions',
          lang: t.label?.toLowerCase()?.slice(0, 2) || 'en',
          default: t.default || false
        })) || [];

        resolvedSources.unshift({
          sourceName: 'MegaPlay',
          type: 'hls',
          decodedPath: fileUrl,
          directLinks: [fileUrl],
          tracks: mappedTracks
        } as any);
      } else if (mode === 'sub-id') {
        resolvedSources.unshift({
          sourceName: 'MegaPlay (Soft-ID)',
          type: 'hls',
          decodedPath: fileUrl,
          directLinks: [fileUrl],
          tracks: []
        } as any);
      }
    }

    const result = {
      episode,
      title,
      synopsis,
      episodeSynopsis,
      thumbnail,
      sources: resolvedSources,
    };

    if (resolvedSources.length > 0) {
      await setCache(cacheKey, result, mode === 'sub-id' ? 1800000 : 90_000);
      markCacheIndex(cacheKey, id, episode, 'episode-links');
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Upstream fetch failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
