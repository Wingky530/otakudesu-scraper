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
*   **Cloudflare Worker Proxy**: The source code contains placeholders marked as `[YOUR_PROXY_URL_HERE]`. These must be replaced with your own Cloudflare Worker Proxy URL. The proxy is strictly required for every request to bypass anti-bot blocks, hide the origin IP address, and attach valid `User-Agent` headers without being rejected by the target server.
*   **Cheerio**: All HTML structure parsing processes are performed using the `cheerio` library.
