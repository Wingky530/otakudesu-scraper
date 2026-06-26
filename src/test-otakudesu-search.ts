import * as cheerio from 'cheerio';

async function test() {
  const proxyUrl = 'https://[YOUR_PROXY_URL_HERE]/?url=';
  const targetSearch = `https://otakudesu.blog/?s=${encodeURIComponent("Boku no Hero Academia Season 7")}`;
  const searchRes = await fetch(`${proxyUrl}${encodeURIComponent(targetSearch)}`);
  const html = await searchRes.text();
  const $ = cheerio.load(html);
  
  $('a').each((i, a) => {
    const href = $(a).attr('href') || '';
    if (href.includes('/anime/')) {
      console.log("Found anime link:", $(a).text().trim(), href);
    }
  });
}
test();
