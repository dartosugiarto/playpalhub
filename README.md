# PlayPal.ID

Website statis multi-halaman untuk katalog digital PlayPal.ID.

Situs ini menampilkan produk, pre-order, dan akun game. Semua data diambil secara dinamis dari Google Sheets menggunakan Google Visualization API.

## Fitur

* Katalog Produk (Filter & Pencarian)
* Lacak Pre-Order
* Galeri Akun Game
* Perpustakaan Digital
* Modal Pembayaran dengan integrasi WhatsApp

## Teknologi

* HTML5
* CSS3 (Vanilla)
* JavaScript (Vanilla)
* Google Sheets (sebagai CMS)

## Menjalankan Proyek

1.  Pastikan Anda memiliki server lokal (seperti ekstensi "Live Server" di VS Code) untuk menghindari masalah CORS saat mengambil data dari Google Sheets.
2.  Jalankan server lokal dari root folder proyek.
3.  Buka `index.html` di browser Anda.

**Server Lokal Sederhana (Alternatif):**

Jika menggunakan Python 3:
```bash
python -m http.server
