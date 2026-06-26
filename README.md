# Otakudesu Scraper Documentation

Dokumentasi ini menjelaskan langkah dasar untuk melakukan web scraping pada situs Otakudesu menggunakan Node.js.

## Kebutuhan Sistem dan Pustaka

Pastikan Node.js sudah terinstal. Dua pustaka utama yang dibutuhkan adalah:
*   **Axios**: Untuk melakukan HTTP GET request dan mengambil konten HTML dari halaman web target.
*   **Cheerio**: Untuk memproses (parsing) konten HTML yang didapatkan, memungkinkan ekstraksi data menggunakan selektor ala jQuery.

Instalasi pustaka:
```bash
npm install axios cheerio
```

## Proses Scraping

Proses ini melibatkan inspeksi elemen pada halaman target untuk menemukan class atau ID yang menyimpan data spesifik.

1.  Akses halaman target di browser.
2.  Buka Developer Tools (Inspect Element).
3.  Identifikasi elemen pembungkus data. Pada Otakudesu, daftar anime biasanya dibungkus dalam div dengan class tertentu (misal: `.venz` atau `.detpost`).
4.  Gunakan selektor tersebut di dalam Cheerio untuk mengekstrak teks atau atribut HTML.

## Contoh Kode Dasar

Berikut adalah contoh fungsi dasar untuk mengambil judul dan tautan dari halaman beranda.

```javascript
const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeHome(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        const results = [];
        
        $('.venz ul li').each((index, element) => {
            const title = $(element).find('h2.jdlflm').text().trim();
            const link = $(element).find('a').attr('href');
            const episode = $(element).find('.epz').text().trim();
            
            if (title && link) {
                results.push({ title, episode, link });
            }
        });
        
        return results;
    } catch (error) {
        console.error('Gagal mengambil data:', error.message);
        return [];
    }
}
```

## Praktik Terbaik dan Kendala

Beberapa hal penting untuk diperhatikan saat membuat scraper:

*   **Header Request**: Selalu sertakan header `User-Agent` yang valid. Server sering memblokir request yang terdeteksi berasal dari skrip bot default.
*   **Jeda Waktu**: Jangan melakukan request terlalu cepat secara berurutan. Berikan jeda waktu antar request untuk menghindari pembatasan akses (rate limit) atau pemblokiran IP.
*   **Perawatan Kode**: Struktur HTML dapat berubah kapan saja. Scraper membutuhkan pemeliharaan rutin. Jika hasil ekstraksi kosong, periksa kembali elemen di peramban dan perbarui selektor di kode.
*   **Penggunaan Proxy**: Jika target menerapkan blokir IP ketat, pertimbangkan untuk merotasi alamat IP menggunakan layanan proxy.
