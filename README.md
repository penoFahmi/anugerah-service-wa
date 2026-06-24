# Anugerah Service WA

Repository ini khusus untuk API gateway WhatsApp (WA) yang berjalan pada port khusus sebagai layanan backend. Frontend terpisah dan berada di repository anugerah-computer (Laravel). Komponen NLP untuk klasifikasi niat berada di repository anugerah-service-nlp. Ketiga repository bekerja sebagai microservice yang saling berkaitan: anugerah-service-wa (WA API), anugerah-computer (frontend/backend Laravel yang menerima webhook), dan anugerah-service-nlp (NLP).

## Fitur
- Menjalankan API gateway WhatsApp pada port khusus untuk komunikasi dengan gateway WA
- Meneruskan/menangani webhook ke Laravel (repo: anugerah-computer)
- Integrasi dengan service NLP (repo: anugerah-service-nlp) untuk klasifikasi niat
- Pengelolaan template pesan
- Pengiriman pesan otomatis / terjadwal
- Logging dan monitoring sederhana

> Catatan: Sesuaikan detail fitur di atas dengan implementasi aktual proyek.

## Prasyarat
- PHP (jika ada bagian Laravel di repo lain)
- Composer (untuk anugerah-computer jika diperlukan)
- Node.js & npm (jika ada frontend/build step pada repo frontend)
- Web server atau lingkungan lokal seperti Laragon
- Pastikan ketiga repo (anugerah-service-wa, anugerah-computer, anugerah-service-nlp) dikonfigurasi sesuai setting microservice (ports, base URLs, credentials)

## Instalasi
1. Clone repository anugerah-service-wa ke server/mesin yang akan menjalankan WA API gateway.
2. Sesuaikan pengaturan port untuk service ini (jalankan pada port khusus yang tidak bentrok dengan anugerah-computer).
3. Install dependensi (sesuaikan stack proyek):
   - composer install (jika proyek menggunakan PHP)
   - npm install (jika ada komponen node)
4. Pastikan anugerah-computer (Laravel) dan anugerah-service-nlp tersedia dan dapat diakses oleh service ini melalui network atau URL yang dikonfigurasi.

## Konfigurasi
1. Salin file environment contoh dan sesuaikan:
	cp .env.example .env
2. Variabel penting (contoh):
	- SERVICE_PORT: port khusus untuk anugerah-service-wa
	- WA_GATEWAY_URL / WA_API_KEY: konfigurasi gateway WhatsApp
	- WEBHOOK_LARAVEL_URL: URL webhook pada anugerah-computer (Laravel) yang akan menerima event
	- NLP_SERVICE_URL: URL anugerah-service-nlp untuk klasifikasi niat
	- LOG_LEVEL, APP_ENV, APP_DEBUG
3. Jalankan migrasi atau setup lain jika proyek memerlukannya.

## Menjalankan Aplikasi
- Jalankan service pada port yang sudah dikonfigurasi (contoh: SERVICE_PORT=9000). Pastikan port ini tidak dipakai oleh anugerah-computer.
- Pastikan anugerah-computer (Laravel) tersedia untuk menerima webhook pada WEBHOOK_LARAVEL_URL.

## Endpoint & Penggunaan
- Dokumentasikan endpoint WA API gateway di README atau Postman collection. Penting mencantumkan:
	- Endpoint untuk menerima webhook dari gateway WA
	- Endpoint untuk forward/event ke Laravel (anugerah-computer)
	- Endpoint untuk panggilan ke NLP (anugerah-service-nlp)

## Logging & Monitoring
- Periksa folder storage/logs (Laravel) atau lokasi log sesuai framework.

## Testing
- Jalankan test suite jika tersedia:
  php artisan test

## Deployment
- Deploy setiap microservice (anugerah-service-wa, anugerah-computer, anugerah-service-nlp) secara independen.
- Set environment variables sesuai dan pastikan jaringan antar service (base URLs, ports) benar.
- Restart service setelah deployment.

## Kontribusi
- Buka issue atau fork repository dan buat pull request.

## Lisensi
- Tambahkan detail lisensi proyek di sini (mis. MIT) atau sesuaikan sesuai kebutuhan.


## Struktur repositori dan catatan
- Repo ini fokus pada API gateway WA. Frontend/backend Laravel: anugerah-computer. NLP: anugerah-service-nlp.
- Ketiga repo harus diatur sesuai arsitektur microservice: URL/port masing-masing, keamanan (API keys), dan routing webhook.

## Kontak
- Untuk pertanyaan lebih lanjut, hubungi maintainer proyek.

--
README ini bersifat generik; silakan sesuaikan bagian konfigurasi, dependensi, dan perintah sesuai implementasi aktual proyek.
