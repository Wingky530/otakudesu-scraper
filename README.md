# Otakudesu Scraper Documentation

> [!WARNING]
> These scraping scripts are strictly designed for and tested on the `https://otakudesu.blog` domain. If the website changes its domain or updates its core structure, the scripts may break and will require adjustments.

This repository contains a collection of prototypes and testing scripts for scraping the Otakudesu website. These scripts were originally developed as part of research for the Cerydra project.

## File Structure

The files inside the `src` directory are Node.js (TypeScript) scripts used to test various stages of scraping:

*   **`test-scrape-otakudesu.ts`**: The main script that encapsulates the entire flow of searching, title matching, and video link extraction (iframe and mirror links).
*   **`test-otakudesu-ajax.ts`** & **`test-otakudesu-ajax-resolve.ts`**: Dedicated scripts to research and decipher how hidden AJAX calls (nonce and mirror link resolution) work on the target site.
*   **`test-otakudesu-search.ts`**: A module focused on the search feature and title matching algorithm (string similarity).
*   **`test-otakudesu-episode-inspect.ts`**: A script to inspect the HTML structure of the episode page and extract the available mirror lists.

## Getting Started (For Forking and Development)

If you wish to fork this repository and run the scripts locally, follow these steps:

### 1. Prerequisites
*   **Node.js**: Ensure you have Node.js installed (v18 or above is recommended).
*   **Cloudflare Worker Proxy**: You must deploy a Cloudflare Worker that accepts a `?url=` parameter and proxies the GET/POST requests. This is required to bypass Cloudflare and IP bans on the target site.

### 2. Installation
Clone the repository and install the dependencies:
```bash
git clone https://github.com/Wingky530/otakudesu-scraper.git
cd otakudesu-scraper
npm install
```

### 3. Setup and Execution
Before running the scripts, you must replace the proxy placeholder.
1. Open the `.ts` files inside the `src` directory.
2. Find `[YOUR_PROXY_URL_HERE]` and replace it with your active Cloudflare Worker URL.
3. Run the main test script using `tsx` (TypeScript Execution):
```bash
npx tsx src/test-scrape-otakudesu.ts
```

## Otakudesu Scraping Flow

Scraping Otakudesu involves a fairly complex flow due to anti-bot protections, page redirections, and the use of AJAX to hide actual video links. Here is the complete flow:

### 1. Anime Search and Match
*   **Request**: Sends a search query via the `/?s=[anime_title]` URL.
*   **Parsing**: Retrieves the list of search results.
*   **Advanced Matching**: Because search results can vary (especially for anime with multiple seasons), the system uses a string similarity algorithm (a modified Levenshtein distance). This algorithm applies a penalty if there is a mismatch on the season or part numbers.

### 2. Anime Page Resolution
*   Sometimes the search results do not point directly to the main anime page (URLs containing `/anime/`), but rather to a category page or another redirection.
*   The system traces these links to ensure the final URL is the actual anime information page containing the episode list.

### 3. Episode Extraction
*   Once on the `/anime/` page, the system looks for the `.episodelist` element.
*   It iterates to match the requested episode number with the available episode text (for example, looking for a specific number in the "Episode 11" label).

### 4. Video Link Extraction and Resolution
This is the most heavily protected part of Otakudesu.

*   **Main Link (Iframe)**: The site often embeds a default iframe directly (such as their own Desustream player or other third-party servers). This link can be extracted directly from the `#pembed iframe` or `.player-embed iframe` element.
*   **Mirror Links**: There is a list of mirror servers with different qualities (360p, 480p, 720p). These links are not written plainly in the HTML.
    *   Each mirror button has a `data-content` attribute containing a base64 string formatted as JSON.
    *   To decode this string, the web client sends a GET request to `wp-admin/admin-ajax.php` with a specific action parameter (example: `aa1208d27f29ca340c92c66d1926f13f`) to get a nonce (a one-time security token).
    *   After obtaining the nonce, a second AJAX request (`action=2a3505c93b0035d3f455df82bf976b84`) is sent carrying the nonce and the base64 payload.
    *   The Otakudesu server then returns a base64 encoded HTML string, which when decoded contains an iframe element with the actual video link (final resolution).

## Technical Notes
*   **Cloudflare Worker Proxy**: This scraper requires a Cloudflare Worker Proxy to bypass anti-bot blocks, hide the origin IP address, and attach valid `User-Agent` headers. You must create a `.env` file in the root directory (copy from `.env.example`) and set the `PROXY_URL` variable.
*   **Cheerio**: All HTML structure parsing processes are performed using the `cheerio` library.

## Cloudflare Worker Setup

To bypass anti-bot mechanisms and CORS restrictions, deploy the following Worker script. Then, set your `.env` file to point to it:
`PROXY_URL="https://your-worker.workers.dev/?url="`

```javascript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrlStr = url.searchParams.get('url');

    if (!targetUrlStr) {
      return new Response(JSON.stringify({ error: "Missing 'url' query parameter" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    try {
      const targetUrl = new URL(targetUrlStr);
      
      const headers = new Headers(request.headers);
      // Attach a realistic user-agent to bypass basic bot detection
      headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
      // Set referer if not present to mimic browser behavior
      if (!headers.has('Referer')) {
        headers.set('Referer', targetUrl.origin);
      }

      // Reconstruct the request to forward
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: headers,
        body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
        redirect: 'follow',
      });

      const response = await fetch(proxyRequest);
      const responseHeaders = new Headers(response.headers);
      
      // Inject CORS headers
      responseHeaders.set("Access-Control-Allow-Origin", "*");
      responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      responseHeaders.set("Access-Control-Allow-Headers", "*");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Failed to proxy request", details: error.message }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }
  },
};
```

## Known Limitations & Fragility Points

When working with this scraper, please be aware of the following fragility points:

*   **Hardcoded AJAX Actions**: The AJAX action hashes (e.g., the nonce fetcher and mirror resolver) are currently hardcoded. Otakudesu may update their backend anytime, which would break the scraper and require manual re-research.
*   **Payload Format Changes**: The base64 payload format found inside the `data-content` attributes on mirror buttons may change structure without notice.
*   **String Similarity Limitations**: The title matching algorithm (string similarity) may occasionally produce false positives for anime franchises that share very similar titles but lack clear season numbering.
*   **Subtitles Only**: Only Indonesian subtitles (*sub Indo*) are supported and available through this method; no dubbed content is provided.
*   **Mirror Reliability**: Not all extracted mirror servers are guaranteed to be active or fully responsive at any given time.
*   **Domain Dependency**: The scraper is tightly coupled to the `otakudesu.blog` domain and will immediately break if the site migrates to a new domain name or alters its URL routing.

## Maintenance Guide

When the scraper inevitably breaks due to upstream changes, follow this guide to re-research and patch it:

1.  **Finding New AJAX Action Hashes**:
    *   Open your browser's DevTools (F12) and navigate to the **Network** tab.
    *   Visit an episode page on the Otakudesu website.
    *   Click on a different mirror server button (e.g., "720p Mp4upload").
    *   Look for XHR/Fetch requests pointing to `wp-admin/admin-ajax.php`.
    *   Inspect the request payloads (Form Data or URL Parameters) to identify the new `action` string being used to fetch the nonce or resolve the mirror link.
2.  **Updating the Source Code**:
    *   Once you have identified the new action strings, locate the `callAjax` invocations in the `.ts` files inside the `src` directory.
    *   Replace the old action hashes with the newly discovered ones.
3.  **Verification Frequency**:
    *   It is highly recommended to re-verify the script after any major site redesign, domain migration, or periods where the video players fail to load correctly on the website itself.

## Request Etiquette & Rate Limiting

To prevent getting your proxy IPs banned and to maintain a healthy scraping environment:

*   **Implement Delays**: Enforce a minimum delay of 1 to 2 seconds between sequential requests.
*   **Avoid Concurrency**: Avoid running multiple concurrent scraping sessions or spamming asynchronous requests against the same target at once.
*   **Proxy Limits**: While the Cloudflare Worker proxy obfuscates your origin IP, it is not a substitute for respectful rate limiting. Over-taxing the proxy will still lead to Cloudflare IPs being temporarily banned by Otakudesu's firewall.

## Sample Output

Below is a realistic but fictional example of the final resolved video object returned after completing the entire scraping flow:

```json
{
  "anime": "Boku no Hero Academia Season 7",
  "episode": "11",
  "sourceUrl": "https://otakudesu.blog/episode/bnha-s7-episode-11-sub-indo/",
  "mirrors": [
    {
      "sourceName": "Default",
      "url": "https://v2.desustream.com/dstream/otakuwatch2/new/hd/index.php?id=WUxqZ043SGQ4OW5EMFNjeUJQSzUydUQ4U0xPYnZLQ1J2bkloQldGOWkzST0="
    }
  ]
}
```
