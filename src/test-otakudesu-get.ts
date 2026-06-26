import 'dotenv/config';
import * as cheerio from 'cheerio';

const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function test() {
  const baseUrl = 'https://otakudesu.blog';
  const proxyUrl = process.env.PROXY_URL + '';

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
    const result = await response.text();
    console.log("Result string:", result.substring(0, 200));
    return result;
  };

  try {
    console.log("Requesting nonce via GET...");
    await callAjaxGet('aa1208d27f29ca340c92c66d1926f13f');
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

test();
