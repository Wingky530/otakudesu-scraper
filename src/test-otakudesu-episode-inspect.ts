import 'dotenv/config';
import * as cheerio from 'cheerio';

async function test() {
  const proxyUrl = process.env.PROXY_URL + '';
  const target = `https://otakudesu.blog/episode/bnha-s7-episode-21-sub-indo/`;
  const res = await fetch(`${proxyUrl}${encodeURIComponent(target)}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  
  $('a').each((i, a) => {
    const href = $(a).attr('href') || '';
    if (href.includes('/anime/')) {
      console.log("Found anime link:", $(a).text().trim(), href);
    }
  });
}
test();
