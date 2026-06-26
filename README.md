# Dokumentasi Scraper Otakudesu

Repositori ini berisi sekumpulan purwarupa (prototype) dan skrip pengujian untuk melakukan scraping pada situs Otakudesu. Skrip-skrip ini sebelumnya dikembangkan sebagai bagian dari riset untuk proyek Cerydra.

## Struktur Berkas

Kumpulan berkas di dalam direktori `src` merupakan skrip Node.js (TypeScript) yang digunakan untuk menguji berbagai tahap scraping:

*   **`test-scrape-otakudesu.ts`**: Skrip utama yang merangkum seluruh alur pencarian, pencocokan judul, hingga ekstraksi tautan video (iframe dan cermin/mirror).
*   **`test-otakudesu-ajax.ts`** & **`test-otakudesu-ajax-resolve.ts`**: Skrip khusus untuk meneliti dan memecahkan cara kerja pemanggilan AJAX tersembunyi (nonce dan resolusi tautan cermin) pada situs target.
*   **`test-otakudesu-search.ts`**: Modul yang berfokus pada fitur pencarian dan algoritma pencocokan judul (string similarity).
*   **`test-otakudesu-episode-inspect.ts`**: Skrip untuk membedah struktur HTML halaman episode dan mengekstrak daftar cermin yang tersedia.

## Alur Scraping Otakudesu

Scraping Otakudesu memiliki alur yang cukup kompleks karena adanya perlindungan anti-bot, pengalihan halaman, dan penggunaan AJAX untuk menyembunyikan tautan video asli. Berikut adalah alur lengkapnya:

### 1. Pencarian Anime (Search & Match)
*   **Request**: Mengirimkan kueri pencarian melalui URL `/?s=[judul_anime]`.
*   **Parsing**: Mengambil daftar hasil pencarian.
*   **Pencocokan Tingkat Lanjut**: Karena hasil pencarian bisa beragam (terutama untuk anime dengan banyak musim), sistem menggunakan algoritma *string similarity* (Levenshtein distance yang dimodifikasi). Algoritma ini memberi penalti jika pencocokan salah pada nomor musim (Season) atau bagian (Part).

### 2. Resolusi Halaman Anime
*   Terkadang hasil pencarian tidak langsung mengarah ke halaman utama anime (URL dengan `/anime/`), melainkan ke halaman kategori atau pengalihan lainnya.
*   Sistem akan melacak tautan tersebut untuk memastikan URL akhir benar-benar merupakan halaman informasi anime yang berisi daftar episode.

### 3. Ekstraksi Episode
*   Setelah berada di halaman `/anime/`, sistem mencari elemen `.episodelist`.
*   Melakukan iterasi untuk mencocokkan nomor episode yang diminta dengan teks episode yang tersedia (misalnya mencari angka spesifik pada label "Episode 11").

### 4. Ekstraksi dan Resolusi Tautan Video
Ini adalah bagian yang paling dilindungi oleh Otakudesu.

*   **Tautan Utama (Iframe)**: Situs sering kali langsung menyematkan iframe bawaan (seperti Ok.ru atau Mp4upload). Tautan ini dapat diambil langsung dari elemen `.player-embed iframe`.
*   **Tautan Cermin (Mirror Links)**: Terdapat daftar server cermin dengan kualitas berbeda (360p, 480p, 720p). Tautan ini tidak tertulis secara gamblang pada HTML.
    *   Setiap tombol cermin memiliki atribut `data-content` yang berisi string *base64* berformat JSON.
    *   Untuk membuka string ini, klien web mengirim request GET ke `wp-admin/admin-ajax.php` dengan parameter *action* tertentu (contoh: `aa1208d27f29ca340c92c66d1926f13f`) guna mendapatkan *nonce* (token keamanan satu kali pakai).
    *   Setelah *nonce* didapatkan, request AJAX kedua (`action=2a3505c93b0035d3f455df82bf976b84`) dikirim dengan membawa *nonce* dan muatan *base64* tadi.
    *   Server Otakudesu kemudian mengembalikan string HTML yang dikodekan *base64*, yang apabila diurai akan berisi elemen iframe dengan tautan video asli (resolusi final).

## Catatan Teknis
*   **Proxy Pekerja (Worker Proxy)**: Skrip ini menggunakan Cloudflare Worker Proxy (`cerydra-video-proxy`) pada setiap request untuk menyembunyikan IP asal dan menambahkan header `User-Agent` yang valid.
*   **Cheerio**: Semua proses pembedahan struktur HTML dilakukan menggunakan library `cheerio`.
