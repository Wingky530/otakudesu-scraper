import * as cheerio from 'cheerio';
import { AGENT } from '../src/lib/allanime.ts';

// Copy scrapeOtakudesu logic from episode-links.ts
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

async function scrapeOtakudesu(title: string, episode: string) {
  const baseUrl = 'https://otakudesu.blog';
  const cleanTitle = title.replace(/^#\d+\s+/, '').trim();
  console.log(`Searching Otakudesu for: "${cleanTitle}"`);

  const searchRes = await fetch(`${baseUrl}/?s=${encodeURIComponent(cleanTitle)}`, {
    headers: { 'User-Agent': AGENT }
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

  console.log("Search results found:", searchResults);
  if (searchResults.length === 0) {
    return [];
  }

  let bestMatch = searchResults[0];
  let maxSim = -999;
  for (const r of searchResults) {
    const sim = getSimilarity(cleanTitle, r.title);
    console.log(`Similarity with "${r.title}":`, sim);
    if (sim > maxSim) {
      maxSim = sim;
      bestMatch = r;
    }
  }

  console.log(`Best match: "${bestMatch.title}" at URL: ${bestMatch.url}`);

  const animeRes = await fetch(bestMatch.url, { headers: { 'User-Agent': AGENT } });
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

  console.log(`Found ${episodes.length} episodes listed on page.`);

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
    console.log(`Episode ${episode} not found in the list.`);
    return [];
  }

  console.log(`Target episode page: "${targetEp.epText}" at URL: ${targetEp.url}`);

  const epRes = await fetch(targetEp.url, { headers: { 'User-Agent': AGENT } });
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

  console.log(`Found ${mirrorLinks.length} mirror streams.`);
  const results: any[] = [];

  const defaultIframe = $('#pembed iframe').length ? $('#pembed iframe') : $('.player-embed iframe');
  if (defaultIframe.length && defaultIframe.attr('src')) {
    let url = defaultIframe.attr('src') || '';
    if (url.startsWith('//')) url = 'https:' + url;
    let name = 'Default';
    if (url.includes('ok.ru')) name = 'Ok';
    else if (url.includes('mp4upload')) name = 'Mp4';
    else if (url.includes('streamwish')) name = 'Sw';
    results.push({ sourceName: name, url });
  }

  const callAjax = async (action: string, data: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    params.append('action', action);
    for (const [key, value] of Object.entries(data)) {
      params.append(key, value);
    }
    const response = await fetch(`${baseUrl}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': AGENT,
        'Referer': targetEp!.url
      },
      body: params.toString()
    });
    if (!response.ok) throw new Error(`Ajax POST failed: HTTP ${response.status}`);
    const result = await response.json();
    return result.data;
  };

  try {
    const nonce = await callAjax('aa1208d27f29ca340c92c66d1926f13f');
    if (nonce) {
      console.log("Obtained nonce:", nonce);
      for (const link of mirrorLinks) {
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

              results.push({
                sourceName: `${name} (${link.quality})`,
                url
              });
            }
          }
        } catch (e: any) {
          console.error(`Failed to resolve mirror ${link.name}:`, e.message);
        }
      }
    }
  } catch (err: any) {
    console.error('Error resolving mirrors:', err.message);
  }

  return results;
}

async function run() {
  const title = "Re:Zero kara Hajimeru Isekai Seikatsu Season 4";
  const episode = "11";
  try {
    const res = await scrapeOtakudesu(title, episode);
    console.log("Scraped results:", JSON.stringify(res, null, 2));
  } catch (e: any) {
    console.error("Failed:", e.message);
  }
}

run();
