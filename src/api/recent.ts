import type { APIRoute } from 'astro';
import * as cheerio from 'cheerio';
import { getCache, setCache } from '../../../lib/anime-cache';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  
  const cacheKey = `seasonal:spring2026:v2:${page}`;
  const cached = await getCache<any>(cacheKey, 1800_000);
  if (cached) {
    return new Response(JSON.stringify(cached), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch('https://myanimelist.net/anime/season/2026/spring', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) {
      throw new Error(`MAL responded with status: ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    
    const results: any[] = [];
    $('.js-anime-category-producer').each((i, el) => {
      const titleEl = $(el).find('h2.h2_anime_title a.link-title');
      const title = titleEl.text().trim();
      const link = titleEl.attr('href');
      
      const score = $(el).find('.js-score').text().trim();
      const membersText = $(el).find('.js-members').text().trim();
      const members = parseInt(membersText.replace(/,/g, ''), 10) || 0;
      const synopsis = $(el).find('.preline').text().trim();
      
      // MAL seasonal page images are heavily lazy-loaded
      const imgEl = $(el).find('.image img');
      const img = imgEl.attr('data-src') || imgEl.attr('src');
      
      let mal_id = null;
      if (link) {
        const match = link.match(/\/anime\/(\d+)/);
        if (match) mal_id = match[1];
      }
      
      const genres: { name: string }[] = [];
      $(el).find('.genres-inner a').each((_, gEl) => {
        const gName = $(gEl).text().trim();
        if (gName) genres.push({ name: gName });
      });
      
      if (mal_id && title && img) {
        results.push({
          mal_id,
          title,
          synopsis: synopsis || 'No synopsis available.',
          members,
          genres,
          images: {
            webp: { large_image_url: img },
            jpg: { large_image_url: img }
          },
          score: score && score !== 'N/A' ? parseFloat(score) : null
        });
      }
    });

    const perPage = 12;
    const startIndex = (page - 1) * perPage;
    const paginatedResults = results.slice(startIndex, startIndex + perPage);

    const responseData = { data: paginatedResults };

    // Cache for 30 minutes since seasonal pages update occasionally
    setCache(cacheKey, responseData, 30 * 60 * 1000);

    return new Response(JSON.stringify(responseData), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('MAL Scrape Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to scrape MAL', details: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
