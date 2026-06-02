// const {
//     default: makeWASocket,
//     useMultiFileAuthState,
//     DisconnectReason,
//     fetchLatestBaileysVersion
// } = require('@whiskeysockets/baileys')

// const express = require('express')
// const axios = require('axios')
// const fs = require('fs')
// const app = express()
// app.use(express.json())

// let sock
// let lastQR = null

// async function startWA() {
//     const { state, saveCreds } = await useMultiFileAuthState('auth')
//     const { version } = await fetchLatestBaileysVersion()

//     sock = makeWASocket({
//         version,
//         auth: state,
//         printQRInTerminal: true,
//         browser: ['Anugerah ERP', 'Chrome', '1.0.0']
//     })

//     sock.ev.on('creds.update', saveCreds)

//     sock.ev.on('connection.update', async (update) => {
//         const { connection, lastDisconnect, qr } = update
        
//         if (qr) {
//             lastQR = qr; // Simpan QR untuk dikirim ke Laravel
//         }

//         if (connection === 'open') {
//             console.log('✅ WhatsApp Connected')
//             lastQR = null
//         }

//         if (connection === 'close') {
//             const statusCode = lastDisconnect?.error?.output?.statusCode;
//             const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
//             if (shouldReconnect) {
//                 startWA()
//             } else {
//                 console.log('❌ WhatsApp Logged Out dari HP');
//             }
//         }
//     })

//     // Webhook: Teruskan pesan masuk ke Laravel
//     sock.ev.on('messages.upsert', async (msg) => {
//         const m = msg.messages[0]
//         if (!m.message || m.key.fromMe) return

//         // 1. Bersihkan Nomor HP (Buang ID Perangkat dari versi WA multi-device)
//         let sender = m.key.remoteJid.replace('@s.whatsapp.net', '');
//         sender = sender.split(':')[0]; // Memastikan bersih dari titik dua (Device ID)

//         // 2. EKSTRAKTOR PESAN SUPER LENGKAP (Anti-Gagal untuk semua OS dan Versi WA)
//         let text = '';
//         const type = Object.keys(m.message)[0]; // Ambil tipe struktur pesan utama

//         if (type === 'conversation') {
//             text = m.message.conversation; // Teks biasa
//         } else if (type === 'extendedTextMessage') {
//             text = m.message.extendedTextMessage.text; // Pesan hasil reply atau teks panjang
//         } else if (type === 'ephemeralMessage') {
//             // Pesan sementara (Disappearing messages)
//             const ephemeralType = Object.keys(m.message.ephemeralMessage.message)[0];
//             if (ephemeralType === 'conversation') {
//                 text = m.message.ephemeralMessage.message.conversation;
//             } else if (ephemeralType === 'extendedTextMessage') {
//                 text = m.message.ephemeralMessage.message.extendedTextMessage.text;
//             }
//         } else if (type === 'imageMessage' && m.message.imageMessage.caption) {
//             // Menangkap teks jika pelanggan kirim foto barang rusak + caption
//             text = m.message.imageMessage.caption;
//         } else if (type === 'videoMessage' && m.message.videoMessage.caption) {
//             // Menangkap teks dari caption video
//             text = m.message.videoMessage.caption;
//         }

//         // 3. Jika teksnya kosong (misal: murni stiker, voice note, tanpa teks), hentikan eksekusi.
//         if (!text || !text.trim()) return;

//         // 4. Kirim ke Laravel
//         try {
//             await axios.post('http://127.0.0.1:8000/api/message', {
//                 phone: sender,
//                 message: text.trim()
//             }, {
//                 headers: { 'X-Token': 'anugerah2026' }
//             })
//         } catch (err) {
//             console.log('❌ Gagal lapor ke Laravel. Alasan dari server:');
//             console.log(err.response ? err.response.data : err.message);
//         }
//     })
// }

// // 1. Endpoint untuk Laravel cek status & ambil QR
// app.get('/status', (req, res) => {
//     res.json({
//         isConnected: !!sock?.user,
//         qr: lastQR,
//         number: sock?.user?.id.split(':')[0] || null
//     })
// });

// // 2. Endpoint untuk memutus koneksi (Logout) dari Laravel
// app.post('/logout', async (req, res) => {
//     console.log('⚠️ Menerima perintah Logout dari Laravel...');
//     try {
//         if (sock) {
//             await sock.logout(); // Beritahu server WA untuk memutus sesi
//         }
//     } catch (e) {
//         console.log("Abaikan error logout:", e.message);
//     }

//     // HAPUS FOLDER 'auth' SECARA PAKSA
//     if (fs.existsSync('./auth')) {
//         fs.rmSync('./auth', { recursive: true, force: true });
//         console.log('🗑️ Folder sesi auth berhasil dihapus.');
//     }

//     lastQR = null;
//     sock = null;

//     // JALANKAN ULANG SISTEM UNTUK MENGHASILKAN QR BARU
//     console.log('🔄 Memulai ulang sistem WA...');
//     startWA();

//     res.json({ status: 'logged_out' });
// });

// // 3. Endpoint untuk Laravel kirim pesan
// app.post('/send-message', (req, res) => {
//     const { phone, message } = req.body;
    
//     // 1. Langsung jawab Laravel (Fire and Forget) agar Laravel tidak timeout
//     res.json({ status: 'queued' });

//     // 2. Eksekusi asinkron di latar belakang untuk menembus keamanan HP
//     (async () => {
//         try {
//             const cleanPhone = phone.split(':')[0];
//             const jid = `${cleanPhone}@s.whatsapp.net`;
            
//             if (sock) {
//                 // TRIK MEMBANGUNKAN HP PELANGGAN:
//                 // A. Beritahu server WA kita akan berinteraksi dengan nomor ini
//                 await sock.presenceSubscribe(jid);
                
//                 // B. Jeda sebentar (1 detik)
//                 await new Promise(resolve => setTimeout(resolve, 1000));
                
//                 // C. Simulasikan "Sedang mengetik..." agar HP pelanggan "terbangun" dari mode hemat baterai
//                 await sock.sendPresenceUpdate('composing', jid);
                
//                 // D. Biarkan tulisan "Sedang mengetik..." muncul selama 2 detik
//                 await new Promise(resolve => setTimeout(resolve, 2000));
//                 await sock.sendPresenceUpdate('paused', jid); // Matikan status mengetik

//                 // E. HP sudah bangun & siap. Tembak pesannya sekarang!
//                 await sock.sendMessage(jid, { text: message });
//                 console.log(`✅ Sukses kirim balasan ke ${jid}`);
//             }
//         } catch (err) {
//             console.log('❌ Gagal kirim WA latar belakang:', err.message);
//         }
//     })();
// });

// startWA()
// app.listen(3001, () => console.log('🚀 WA Gateway Berjalan di Port 3001'))

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')

const express = require('express')
const axios = require('axios')
const fs = require('fs')
const app = express()
app.use(express.json())

let sock
let lastQR = null

async function startWA() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        browser: ['Anugerah ERP', 'Chrome', '1.0.0']
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update
        
        if (qr) lastQR = qr;

        if (connection === 'open') {
            console.log('✅ WhatsApp Connected & Ready!')
            lastQR = null
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 Koneksi terputus, mencoba menghubungkan kembali...');
                startWA()
            } else {
                console.log('❌ WhatsApp Logged Out dari HP. Silakan hapus folder auth dan scan ulang.');
            }
        }
    })

    // Webhook: Teruskan pesan masuk ke Laravel
    sock.ev.on('messages.upsert', async (msg) => {
        const m = msg.messages[0]
        if (!m.message || m.key.fromMe) return

        let sender = m.key.remoteJid.replace('@s.whatsapp.net', '');
        sender = sender.split(':')[0]; 

        // 2. EKSTRAKTOR SAPU JAGAT (Paling aman dari bug WA Baru)
        let text = '';
        if (m.message?.conversation) {
            text = m.message.conversation;
        } else if (m.message?.extendedTextMessage?.text) {
            text = m.message.extendedTextMessage.text;
        } else if (m.message?.ephemeralMessage?.message?.extendedTextMessage?.text) {
            text = m.message.ephemeralMessage.message.extendedTextMessage.text;
        } else if (m.message?.ephemeralMessage?.message?.conversation) {
            text = m.message.ephemeralMessage.message.conversation;
        } else if (m.message?.imageMessage?.caption) {
            text = m.message.imageMessage.caption;
        } else if (m.message?.videoMessage?.caption) {
            text = m.message.videoMessage.caption;
        }

        // Hentikan jika benar-benar tidak ada teks
        if (!text || !text.trim()) return;

        console.log(`📥 Pesan Masuk dari ${sender}: "${text.trim()}"`);

        // 3. Kirim ke Laravel
        try {
            await axios.post('http://127.0.0.1:8000/api/message', {
                phone: sender,
                message: text.trim()
            }, {
                headers: { 'X-Token': 'anugerah2026' }
            })
            console.log(`✅ Pesan dari ${sender} berhasil diteruskan ke Laravel`);
        } catch (err) {
            console.log('❌ Gagal lapor ke Laravel:', err.response ? err.response.data : err.message);
        }
    })
}

app.get('/status', (req, res) => {
    res.json({
        isConnected: !!sock?.user,
        qr: lastQR,
        number: sock?.user?.id.split(':')[0] || null
    })
});

app.post('/logout', async (req, res) => {
    console.log('⚠️ Menerima perintah Logout dari Laravel...');
    try {
        if (sock) await sock.logout();
    } catch (e) {}

    if (fs.existsSync('./auth')) {
        fs.rmSync('./auth', { recursive: true, force: true });
        console.log('🗑️ Folder sesi auth berhasil dihapus.');
    }

    lastQR = null; sock = null;
    startWA();
    res.json({ status: 'logged_out' });
});

app.post('/send-message', (req, res) => {
    const { phone, message } = req.body;
    res.json({ status: 'queued' });

    (async () => {
        try {
            const cleanPhone = phone.split(':')[0];
            const jid = `${cleanPhone}@s.whatsapp.net`;
            
            if (sock) {
                // Trik "Sedang Mengetik" untuk membangunkan WA HP Pelanggan
                await sock.presenceSubscribe(jid);
                await new Promise(resolve => setTimeout(resolve, 500));
                await sock.sendPresenceUpdate('composing', jid);
                await new Promise(resolve => setTimeout(resolve, 1500));
                await sock.sendPresenceUpdate('paused', jid);

                await sock.sendMessage(jid, { text: message });
                console.log(`📤 Sukses kirim balasan ke ${cleanPhone}`);
            }
        } catch (err) {
            console.log('❌ Gagal kirim WA latar belakang:', err.message);
        }
    })();
});

startWA()
app.listen(3001, () => console.log('🚀 WA Gateway Berjalan di Port 3001'))