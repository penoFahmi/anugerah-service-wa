# Anugerah WhatsApp Service (Baileys Gateway)

Microservice berbasis Node.js yang bertugas sebagai **WhatsApp Web API Gateway** independen untuk ekosistem aplikasi **Anugerah Computer**. 

Layanan ini dibangun menggunakan library `@whiskeysockets/baileys` untuk mengaktifkan koneksi Multi-Device WhatsApp tanpa memerlukan pihak ketiga berbayar.

## 🔄 Peran dalam Arsitektur *Microservices*

Sistem Anugerah Computer terbagi menjadi 3 pilar utama, dan repositori ini adalah pilar komunikasi:
1. **anugerah-computer (Laravel):** Otak utama (Orchestrator) & UI/UX.
2. **anugerah-service-nlp (Python):** Mesin pendeteksi niat pelanggan (AI).
3. **anugerah-service-wa (Node.js) - Repositori ini:** Jembatan komunikasi antara sistem dan ponsel WhatsApp pelanggan.

**Alur Kerja Utama:**
- **Menerima Pesan Masuk:** Menangkap pesan pelanggan dari WhatsApp dan meneruskannya secara *real-time* ke Laravel via Webhook.
- **Mengirim Pesan Keluar:** Menyediakan REST API lokal agar Laravel dapat mengirimkan balasan AI, notifikasi garansi, dan e-Nota servis secara instan.

## ✨ Fitur Utama

- **WhatsApp Multi-Device Support:** Kompatibel dengan arsitektur WhatsApp terbaru.
- **Session Management Otomatis:** Sesi login (QR Code) disimpan secara persisten di folder lokal/database (tergantung implementasi Baileys).
- **Kirim Teks & Dokumen:** Mendukung pengiriman teks (*Reply* dari NLP/Groq) dan dokumen PDF (*Print Ticket / Receipt*).
- **REST API Endpoint:** *Endpoint* yang aman dan ringan untuk dipanggil secara eksklusif oleh server Laravel lokal.

## 🚀 Panduan Instalasi (Development)

Pastikan **Node.js (v16 atau v18+)** sudah terinstal di server/komputer Anda.

1. **Clone repositori ini:**
   ```bash
   git clone https://github.com/penoFahmi/anugerah-service-wa.git
   cd anugerah-service-wa
   ```

2. **Install Dependensi Node.js:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment:**
   Jika ada file `.env.example`, salin menjadi `.env`.
   Pastikan Anda mengatur URL Webhook yang mengarah ke backend Laravel:
   ```env
   PORT=3000
   LARAVEL_WEBHOOK_URL=http://localhost:8000/api/webhook/whatsapp
   ```

4. **Jalankan Gateway:**
   ```bash
   npm start
   # atau
   node index.js
   ```

5. **Koneksi / Login WhatsApp:**
   - Saat pertama kali dijalankan, sistem akan meng- *generate* QR Code di terminal (atau via UI jika disediakan).
   - *Scan* QR Code tersebut menggunakan aplikasi WhatsApp di HP toko Anugerah Computer (menu *Linked Devices*).
   - Setelah status "Connected", aplikasi sudah siap menjembatani komunikasi ke Laravel!

## ⚠️ Catatan Keamanan
Karena layanan ini memiliki akses penuh ke sesi WhatsApp toko, **pastikan microservice ini tidak terekspos secara publik** (jangan buka port ini ke internet luas). Akses API hanya boleh dilakukan dari *localhost* atau IP internal server Laravel.

---
*Dikembangkan untuk operasional Anugerah Computer & Keperluan Akademis Skripsi.*
