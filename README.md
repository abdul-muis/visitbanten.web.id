# Dinas Pariwisata Provinsi Banten — Paket Produksi

Situs ini sekarang menggunakan **PHP + MySQL sungguhan** — bukan lagi simulasi di
browser. Semua data (destinasi, wisata religi, akomodasi, paket wisata, kalender
event, produk ekraf, pengaturan situs, menu) tersimpan permanen di database, dan
login admin memakai autentikasi asli (password ter-enkripsi, sesi, proteksi CSRF).

Panduan ini ditulis untuk hosting **cPanel dengan PHP + MySQL** (jenis hosting
paling umum di Indonesia). Kalau hosting Anda berbeda (VPS, Node.js, dsb), beri
tahu saya dan saya sesuaikan.

---

## 1. Yang Anda butuhkan sebelum mulai

- Akses cPanel (atau panel setara) di hosting Anda
- PHP **7.4 atau lebih baru** (cek di cPanel → "MultiPHP Manager" / "Select PHP Version")
- Ekstensi PHP aktif: `pdo_mysql`, `gd`, `mbstring`, `session` — biasanya semua ini
  sudah aktif secara default di hosting cPanel manapun
- Akses FTP / File Manager untuk upload file
- Akses phpMyAdmin (untuk membuat tabel database)

---

## 2. Langkah instalasi

### A. Buat database MySQL

1. Di cPanel, buka **MySQL® Databases**.
2. Buat database baru, misalnya `banten` → hasil akhirnya biasanya
   `namauser_banten`.
3. Buat user database baru dengan password yang kuat.
4. Tambahkan user tersebut ke database dengan hak akses **All Privileges**.
5. Catat tiga hal ini: **nama database**, **nama user**, **password user**.

### B. Import struktur database

1. Buka **phpMyAdmin** dari cPanel.
2. Pilih database yang baru dibuat di sidebar kiri.
3. Klik tab **Import**, pilih file `database/schema.sql` dari paket ini, lalu klik **Go**.
4. Pastikan muncul pesan sukses dan semua tabel (`admin_users`, `site_settings`,
   `menu_items`, `destinations`, `religi`, `akomodasi`, `paket`, `kalender`, `ekraf`)
   sudah terbentuk dengan data awal di dalamnya.

### C. Upload semua file situs

1. Upload **seluruh isi folder ini** (bukan folder itu sendiri, tapi isinya) ke
   `public_html` (atau folder subdomain Anda) lewat File Manager atau FTP.
   Strukturnya harus jadi seperti ini di server:
   ```
   public_html/
     index.html
     styles.css
     script.js
     i18n.js
     setup.php
     .htaccess
     api/
       config.php
       auth.php
       data.php
       settings.php
       menu.php
       items.php
       upload.php
       session_helper.php
       .htaccess
     database/
       schema.sql
     uploads/
       .htaccess
       destinations/  religi/  akomodasi/  paket/  kalender/  logo/
     assets/
       img/    (foto destinasi bawaan)
       logo/   (logo Exciting Banten bawaan)
   ```
2. Pastikan folder `uploads/` dan semua sub-foldernya bisa ditulis oleh PHP
   (permission **755**, di kebanyakan hosting cPanel ini otomatis benar karena
   dimiliki oleh user Anda sendiri).

### D. Sambungkan ke database

1. Edit `api/config.php` (lewat File Manager → Edit, atau download-edit-upload lagi).
2. Isi 4 baris ini dengan data dari langkah A:
   ```php
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'namauser_banten');
   define('DB_USER', 'namauser_banten');
   define('DB_PASS', 'password_database_anda');
   ```
3. Simpan.

### E. Buat akun admin pertama

1. Buka `https://domain-anda.com/setup.php` di browser.
2. Isi username & password admin pertama Anda (password minimal 8 karakter —
   pilih yang kuat, ini akun yang bisa mengubah seluruh situs).
3. Setelah berhasil, **hapus file `setup.php` dari server** (lewat File Manager).
   Ini wajib — file ini adalah pintu instalasi dan tidak boleh dibiarkan menyala
   selamanya, meski dia menolak jalan dua kali.

### F. Aktifkan HTTPS

1. Di cPanel, aktifkan **AutoSSL** / **Let's Encrypt** untuk domain Anda (biasanya gratis).
2. Setelah SSL aktif dan situs bisa diakses lewat `https://`, buka `.htaccess` di
   root, dan hapus tanda pagar (`#`) di 3 baris redirect HTTPS supaya semua
   trafik otomatis dialihkan ke HTTPS.

### G. Login sebagai admin

1. Buka situs Anda, klik **"⚙ Admin"** di pojok kanan atas.
2. Masuk dengan username & password yang Anda buat di langkah E.
3. Semua perubahan (teks, foto, warna, logo, menu) sekarang tersimpan permanen
   ke database — bisa dicek langsung dari perangkat lain / setelah situs ditutup.

---

## 3. Cara kerja secara singkat

- `index.html` + `styles.css` + `script.js` — situs publik. Saat dibuka,
  `script.js` memanggil `api/data.php` untuk mengambil semua konten dari database
  dan merender halaman.
- `api/*.php` — backend. Setiap aksi admin (simpan pengaturan, tambah destinasi,
  upload foto, dst) memanggil salah satu endpoint ini lewat `fetch()`, yang
  membaca/menulis ke MySQL.
- Login admin memakai **PHP session** (cookie), bukan password yang ditulis di
  kode seperti versi demo sebelumnya. Password di-hash dengan `password_hash()`
  (bcrypt) — bahkan Anda sendiri tidak bisa melihat password aslinya dari database.
- Setiap permintaan yang mengubah data (simpan/hapus) wajib menyertakan token
  CSRF yang dikeluarkan saat login, supaya situs lain tidak bisa diam-diam
  menyuruh browser Anda mengubah data tanpa sepengetahuan Anda.
- Folder `uploads/` punya `.htaccess` sendiri yang mematikan eksekusi PHP di
  dalamnya — supaya kalaupun ada yang mencoba mengunggah file berbahaya
  menyamar sebagai gambar, file itu tidak akan pernah bisa dijalankan sebagai kode.

---

## 4. Setelah situs berjalan

- **Backup rutin**: gunakan fitur *Backup Wizard* di cPanel (mencadangkan
  database + file sekaligus), idealnya mingguan.
- **Ganti password admin** secara berkala lewat menu Admin → Pengaturan Situs →
  Ubah Password.
- **Tambah admin lain**: saat ini hanya bisa lewat phpMyAdmin (insert baris baru
  ke tabel `admin_users` dengan password yang di-hash). Kalau perlu, saya bisa
  tambahkan halaman "kelola admin" di dashboard.
- Kalau butuh restore data lama, gunakan tombol **Ekspor Data** di dashboard
  admin untuk cadangan konten, dan **phpMyAdmin → Export** untuk cadangan
  database penuh.

---

## 5. Troubleshooting

| Gejala | Kemungkinan penyebab |
|---|---|
| Halaman putih / "Gagal memuat situs" | Kredensial di `api/config.php` salah, atau database belum di-import |
| Tombol edit/hapus di admin tidak merespons | Beberapa hosting memblokir method `PUT`/`DELETE`. Hubungi support hosting untuk mengizinkannya, atau beri tahu saya untuk saya buatkan solusi alternatif |
| Upload foto gagal | Ekstensi `gd` belum aktif — cek di cPanel → PHP Extensions, aktifkan `gd` |
| "Token keamanan tidak valid" terus muncul | Sesi login kedaluwarsa (8 jam) — logout lalu login ulang |
| Lupa password admin | Buka phpMyAdmin → tabel `admin_users` → update manual (butuh hash bcrypt baru; beri tahu saya kalau butuh bantuan generate-nya) |

---

Kalau ada bagian yang error saat instalasi, kirim pesan errornya ke saya —
saya bisa bantu diagnosis lebih lanjut.
