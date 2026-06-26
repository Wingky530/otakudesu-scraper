import { AGENT } from '../src/lib/allanime.ts';

async function run() {
  const baseUrl = 'https://otakudesu.blog';
  const action = 'aa1208d27f29ca340c92c66d1926f13f'; // Nonce action

  // Construct GET URL
  const getUrl = `${baseUrl}/wp-admin/admin-ajax.php?action=${action}`;
  console.log("Testing Otakudesu AJAX via GET...");
  try {
    const res = await fetch(getUrl, {
      headers: {
        'User-Agent': AGENT,
        'Referer': 'https://otakudesu.blog/episode/rezr-isktsu-s4-episode-11-sub-indo/'
      }
    });
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log(`Data returned:`, data);
  } catch (e: any) {
    console.error("GET failed:", e.message);
  }
}

run();
