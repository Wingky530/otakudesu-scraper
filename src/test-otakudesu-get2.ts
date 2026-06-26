import * as cheerio from 'cheerio';

const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function test() {
  const baseUrl = 'https://otakudesu.blog';
  const proxyUrl = 'https://cerydra-video-proxy.wingky530-id.workers.dev/?url=';

  const proxyFetch = async (url: string) => {
    const proxyTarget = `${proxyUrl}${encodeURIComponent(url)}`;
    const res = await fetch(proxyTarget, {
      headers: { 'User-Agent': AGENT }
    });
    if (!res.ok) throw new Error(`Proxy fetch failed: HTTP ${res.status}`);
    return await res.text();
  };

  const callAjaxGet = async (action: string, data: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    params.append('action', action);
    for (const [key, value] of Object.entries(data)) {
      params.append(key, value);
    }
    
    const targetUrl = `${baseUrl}/wp-admin/admin-ajax.php?${params.toString()}`;
    const proxyTarget = `${proxyUrl}${encodeURIComponent(targetUrl)}`;

    console.log("GETing from:", proxyTarget);
    
    const response = await fetch(proxyTarget, {
      method: 'GET',
      headers: { 
        'User-Agent': AGENT,
        'Referer': 'https://otakudesu.blog/episode/boku-no-hero-academia-s7-episode-11-sub-indo/'
      }
    });
    
    console.log("Status:", response.status);
    if (!response.ok) throw new Error(`Ajax GET failed: HTTP ${response.status}`);
    const result = await response.json();
    return result.data;
  };

  try {
    console.log("Fetching episode page...");
    const epHtml = await proxyFetch('https://otakudesu.blog/episode/boku-no-hero-academia-s7-episode-11-sub-indo/');
    const $ = cheerio.load(epHtml);
    
    let content = '';
    $('.mirrorstream ul li a').each((i, a) => {
      if ($(a).text().trim().toLowerCase() === 'mega') {
        content = $(a).attr('data-content') || '';
      }
    });
    console.log("MEGA content:", content);

    console.log("Requesting nonce via GET...");
    const nonce = await callAjaxGet('aa1208d27f29ca340c92c66d1926f13f');
    console.log("Nonce received:", nonce);

    if (content && nonce) {
      const payload = JSON.parse(Buffer.from(content, 'base64').toString('utf-8'));
      console.log("Payload:", payload);
      
      console.log("Resolving mirror via GET...");
      const resData = await callAjaxGet('2a3505c93b0035d3f455df82bf976b84', {
        ...payload,
        nonce: nonce
      });
      
      console.log("Result received:", !!resData);
      if (resData) {
        const decodedHtml = Buffer.from(resData, 'base64').toString('utf-8');
        console.log("Decoded HTML:", decodedHtml);
      }
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

test();
