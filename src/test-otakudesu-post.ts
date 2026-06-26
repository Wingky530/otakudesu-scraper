import * as cheerio from 'cheerio';

const AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function test() {
  const baseUrl = 'https://otakudesu.blog';
  const proxyUrl = 'https://[YOUR_PROXY_URL_HERE]/?url=';

  const callAjax = async (action: string, data: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    params.append('action', action);
    for (const [key, value] of Object.entries(data)) {
      params.append(key, value);
    }
    const targetUrl = `${baseUrl}/wp-admin/admin-ajax.php`;
    const proxyTarget = `${proxyUrl}${encodeURIComponent(targetUrl)}`;

    console.log("POSTing to:", proxyTarget);
    const response = await fetch(proxyTarget, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': AGENT,
        'Referer': 'https://otakudesu.blog/episode/bnha-s7-episode-11-sub-indo/'
      },
      body: params.toString()
    });
    
    console.log("Status:", response.status);
    if (!response.ok) throw new Error(`Ajax POST failed: HTTP ${response.status}`);
    const result = await response.json();
    return result.data;
  };

  try {
    console.log("Fetching episode page...");
    const epHtml = await (await fetch(`${proxyUrl}${encodeURIComponent('https://otakudesu.blog/episode/bnha-s7-episode-11-sub-indo/')}`)).text();
    const $ = cheerio.load(epHtml);
    
    let content = '';
    $('.mirrorstream ul li a').each((i, a) => {
      if ($(a).text().trim().toLowerCase() === 'mega') {
        content = $(a).attr('data-content') || '';
      }
    });
    console.log("MEGA content:", !!content);

    console.log("Requesting nonce via POST...");
    const nonce = await callAjax('aa1208d27f29ca340c92c66d1926f13f');
    console.log("Nonce received:", nonce);

    if (content && nonce) {
      const payload = JSON.parse(Buffer.from(content, 'base64').toString('utf-8'));
      
      console.log("Resolving mirror via POST...");
      const resData = await callAjax('2a3505c93b0035d3f455df82bf976b84', {
        ...payload,
        nonce: nonce
      });
      
      console.log("Result received:", !!resData);
      if (resData) {
        const decodedHtml = Buffer.from(resData, 'base64').toString('utf-8');
        console.log("Decoded HTML:", decodedHtml);
        const match = decodedHtml.match(/src="([^"]+)"/i);
        console.log("Extracted URL:", match?.[1]);
      }
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

test();
