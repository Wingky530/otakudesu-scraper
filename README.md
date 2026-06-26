# Dokumentasi Scraper Cerydra (Allanime & MAL)

Repositori ini berisi berkas dan dokumentasi mengenai alur scraping data anime yang digunakan pada proyek Cerydra. Pada implementasinya, Cerydra mengambil data dari dua sumber utama yaitu MyAnimeList (untuk data musiman/terbaru) dan Allanime (untuk pencarian dan tautan episode video), dilengkapi dengan sistem cache dua tingkat (in-memory dan Cloudflare R2).

## Struktur Berkas

Berikut adalah penjelasan fungsi dari setiap berkas yang ada di dalam direktori `src`:

*   **`src/allanime.ts`**: Berisi konstanta URL, Header (User-Agent, Referer), serta fungsi kunci untuk dekripsi. Allanime memproteksi URL video dan muatannya. Berkas ini memiliki logika pemetaan hex (HEX_MAP) untuk URL sumber dan dekripsi AES-256-CTR untuk muatan video.
*   **`src/anime-cache.ts`**: Modul manajemen cache. Menggunakan memori lokal sebagai lapisan pertama (cepat) dan Cloudflare R2 Bucket sebagai lapisan kedua (persisten).
*   **`src/api/search.ts`**: Endpoint API untuk mencari anime. Mengirimkan GraphQL request ke server Allanime dan mengembalikan daftar hasil pencarian.
*   **`src/api/episode-links.ts`**: Endpoint API krusial untuk mengambil tautan video mentah (mp4/hls). Berkas ini melakukan request ke Allanime, mengekstrak URL terenkripsi, lalu mendekripsinya menggunakan utilitas di `allanime.ts`.
*   **`src/api/recent.ts`**: Endpoint API untuk mengambil daftar anime musiman terbaru. Endpoint ini melakukan scraping langsung ke MyAnimeList menggunakan pustaka `cheerio` untuk membedah struktur HTML halaman.

## Alur Kerja (Workflows)

### 1. Pencarian dan Pengambilan Episode (Allanime)
1.  **Permintaan Klien**: Klien memanggil endpoint internal (contoh: `/api/anime/search?q=naruto`).
2.  **Pengecekan Cache**: Sistem akan mengekstrak kunci cache dari parameter kueri. Jika data tersedia di memori atau R2, sistem langsung mengembalikannya.
3.  **Permintaan Sumber**: Jika cache kosong, API mengirim HTTP POST request dengan format GraphQL ke `https://api.allanime.day/api`. Header khusus (`User-Agent` dan `Referer`) wajib disertakan agar request tidak ditolak.
4.  **Dekripsi (Khusus Episode)**: Saat meminta tautan episode video, respons dari Allanime terenkripsi. Server akan menggunakan `decryptSourceUrl` (pemetaan hex) atau `decryptPayload` (dekripsi AES) untuk mendapatkan URL video asli.
5.  **Penyimpanan Cache**: Data yang berhasil didapat atau didekripsi disimpan ke dalam cache (Memory dan R2) untuk mempercepat permintaan berikutnya.
6.  **Pengembalian Data**: Data akhir dalam format JSON dikirimkan kembali ke klien.

### 2. Pengambilan Anime Musiman Terbaru (MyAnimeList)
1.  **Permintaan Klien**: Klien memanggil endpoint `/api/anime/recent`.
2.  **Pengecekan Cache**: Sistem memeriksa cache berdasarkan kunci musim dan halaman (contoh: `seasonal:spring2026:v2:1`).
3.  **Scraping HTML**: Jika cache kosong, API melakukan HTTP GET request ke halaman web musiman MAL.
4.  **Parsing DOM**: Sistem menggunakan `cheerio` untuk mengekstrak elemen HTML spesifik (judul, tautan gambar, skor, jumlah anggota, dan sinopsis) berdasarkan class CSS halaman tersebut.
5.  **Penyimpanan dan Pengembalian**: Data hasil ekstraksi dirangkum menjadi array objek, disimpan ke dalam cache selama 30 menit, dan dikembalikan ke klien.

## Praktik Keamanan dan Anti-Blokir

*   **Identitas Header**: Penggunaan identitas browser (User-Agent) yang spesifik dan valid sangat penting saat meminta data dari Allanime maupun MAL.
*   **Caching Agresif**: Sistem sangat bergantung pada R2 Cache. Hal ini secara drastis mengurangi jumlah request keluar (outbound request) ke server sumber, mencegah pemblokiran IP karena terlalu banyak meminta data.
*   **Rotasi Kunci**: Kunci dekripsi Allanime terkadang berubah. Variabel `DECRYPTION_KEY_STRING` di `allanime.ts` perlu diperbarui jika penyedia mengubah metode enkripsinya.
