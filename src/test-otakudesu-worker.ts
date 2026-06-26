import { AGENT } from '../src/lib/allanime.ts';

async function run() {
  const baseUrl = 'https://otakudesu.blog';
  const cleanTitle = 'Re:Zero kara Hajimeru Isekai Seikatsu Season 4';
  const targetUrl = `${baseUrl}/?s=${encodeURIComponent(cleanTitle)}`;
  const proxyUrl = `https://[YOUR_PROXY_URL_HERE]/?url=${encodeURIComponent(targetUrl)}`;

  console.log("Testing direct fetch to Otakudesu...");
  try {
    const res = await fetch(targetUrl, { headers: { 'User-Agent': AGENT } });
    console.log(`Direct Status: ${res.status}`);
    const text = await res.text();
    console.log(`Direct snippet: ${text.slice(0, 200)}`);
  } catch (e: any) {
    console.error("Direct failed:", e.message);
  }

  console.log("\nTesting fetch to Otakudesu via Worker proxy...");
  try {
    const res = await fetch(proxyUrl, { headers: { 'User-Agent': AGENT } });
    console.log(`Proxy Status: ${res.status}`);
    const text = await res.text();
    console.log(`Proxy snippet: ${text.slice(0, 200)}`);
  } catch (e: any) {
    console.error("Proxy failed:", e.message);
  }
}

run();
