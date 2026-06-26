import 'dotenv/config';
import * as cheerio from 'cheerio';
import { AGENT } from '../src/lib/allanime.ts';

async function run() {
  const baseUrl = 'https://otakudesu.blog';
  const epUrl = 'https://otakudesu.blog/episode/rezr-isktsu-s4-episode-11-sub-indo/';

  console.log("Fetching episode page...");
  const epRes = await fetch(epUrl, { headers: { 'User-Agent': AGENT } });
  const epHtml = await epRes.text();
  const $ = cheerio.load(epHtml);

  // Get mirror links
  const mirrorLinks: { name: string; content: string }[] = [];
  $('.mirrorstream ul li a').each((i, a) => {
    mirrorLinks.push({
      name: $(a).text().trim(),
      content: $(a).attr('data-content') || ''
    });
  });

  if (mirrorLinks.length === 0) {
    console.error("No mirrors found!");
    return;
  }

  const targetLink = mirrorLinks[0];
  console.log(`Selected mirror for testing: ${targetLink.name}`);

  const callAjaxGet = async (action: string, data: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    params.append('action', action);
    for (const [key, value] of Object.entries(data)) {
      params.append(key, value);
    }
    
    const targetUrl = `${baseUrl}/wp-admin/admin-ajax.php?${params.toString()}`;
    const proxyUrl = `${process.env.PROXY_URL}${encodeURIComponent(targetUrl)}`;
    
    console.log(`Calling AJAX via Worker proxy for action: ${action}...`);
    const response = await fetch(proxyUrl, {
      headers: { 
        'User-Agent': AGENT,
        'Referer': epUrl
      }
    });
    if (!response.ok) throw new Error(`Ajax GET failed: HTTP ${response.status}`);
    const result = await response.json();
    return result.data;
  };

  try {
    const nonce = await callAjaxGet('aa1208d27f29ca340c92c66d1926f13f');
    console.log("Obtained nonce via proxy:", nonce);

    if (nonce) {
      const payload = JSON.parse(Buffer.from(targetLink.content, 'base64').toString('utf-8'));
      const resData = await callAjaxGet('2a3505c93b0035d3f455df82bf976b84', {
        ...payload,
        nonce: nonce
      });
      console.log("Response data obtained:", resData ? "Yes (Success)" : "No (Empty)");
      if (resData) {
        const decodedHtml = Buffer.from(resData, 'base64').toString('utf-8');
        console.log("Decoded HTML:", decodedHtml);
      }
    }
  } catch (err: any) {
    console.error("Error during execution:", err.message);
  }
}

run();
