const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const pino = require('pino'); // Tambahan: Untuk mengatur log terminal

const app = express();
app.use(express.json());

// Keamanan: Samakan dengan token di Laravel
const API_TOKEN = 'anugerah2026'; 

let sock;
let lastQR = null;

async function startWA() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        // PERBAIKAN 1: Bungkam log bawaan Baileys agar terminalmu bersih
        logger: pino({ level: 'silent' }), 
        browser: ['Anugerah ERP', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) lastQR = qr;

        if (connection === 'open') {
            console.log('✅ WhatsApp Connected & Ready!');
            lastQR = null;
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 Koneksi terputus, mencoba menghubungkan kembali...');
                setTimeout(startWA, 3000); // Beri jeda 3 detik sebelum konek ulang
            } else {
                console.log('❌ WhatsApp Logged Out dari HP. Silakan hapus folder auth dan scan ulang.');
            }
        }
    });

// Webhook
    sock.ev.on('messages.upsert', async (msg) => {
        const m = msg.messages[0];
        if (!m.message || m.key.fromMe) return;

        let sender = m.key.remoteJid.split('@')[0].split(':')[0]; 

        let text = '';
        let type = 'text';

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
            type = 'image';
        } else if (m.message?.imageMessage && !m.message.imageMessage.caption) {
            text = '[Mengirim Gambar Tanpa Keterangan]';
            type = 'image';
        } else if (m.message?.documentMessage) {
            text = m.message.documentMessage.fileName || '[Mengirim Dokumen]';
            type = 'document';
        }

        if (!text || !text.trim()) return;

        console.log(`📥 Pesan Masuk dari ${sender} (${msg.messages[0].pushName || 'Unknown'}): "${text.trim()}"`);

        try {
            await axios.post('http://127.0.0.1:8000/api/message', {
                phone: sender,
                pushName: msg.messages[0].pushName || 'Pelanggan',
                type: type,
                message: text.trim()
            }, {
                headers: { 'X-Token': API_TOKEN }
            });
            console.log(`✅ Diteruskan ke Laravel`);
        } catch (err) {
            console.log('❌ Gagal lapor ke Laravel (Pastikan server Laravel hidup)');
        }
    });
}

// PERBAIKAN 2: Middleware Cek Token untuk semua endpoint POST
function checkToken(req, res, next) {
    const token = req.headers['x-token'];
    if (token !== API_TOKEN) {
        return res.status(401).json({ error: 'Akses Ditolak! Token tidak valid.' });
    }
    next();
}

app.get('/status', (req, res) => {
    res.json({
        isConnected: !!sock?.user,
        qr: lastQR,
        number: sock?.user?.id.split(':')[0] || null
    });
});

app.post('/logout', checkToken, async (req, res) => {
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

app.post('/send-message', checkToken, (req, res) => {
    const { phone, message } = req.body;
    
    if (!phone || !message) {
        return res.status(400).json({ error: 'Parameter phone dan message wajib diisi!' });
    }

    res.json({ status: 'queued' });

    (async () => {
        try {
            // PERBAIKAN 3: Standarisasi format nomor ke 62 (menghilangkan awalan 0 atau +62)
            let cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = '62' + cleanPhone.substring(1);
            }
            
            const jid = `${cleanPhone}@s.whatsapp.net`;
            
            if (sock) {
                // Trik "Sedang Mengetik"
                await sock.presenceSubscribe(jid);
                await new Promise(resolve => setTimeout(resolve, 500));
                await sock.sendPresenceUpdate('composing', jid);
                await new Promise(resolve => setTimeout(resolve, 1500));
                await sock.sendPresenceUpdate('paused', jid);

                await sock.sendMessage(jid, { text: message });
                console.log(`📤 Sukses kirim balasan ke ${cleanPhone}`);
            } else {
                 console.log('❌ Gagal kirim: WhatsApp belum terhubung.');
            }
        } catch (err) {
            console.log('❌ Gagal kirim WA latar belakang:', err.message);
        }
    })();
});

app.post('/send-document', checkToken, (req, res) => {
    const { phone, caption, document, filename } = req.body;
    
    if (!phone || !document) {
        return res.status(400).json({ error: 'Parameter phone dan document wajib diisi!' });
    }

    res.json({ status: 'queued' });

    (async () => {
        try {
            // Standarisasi nomor HP ke awalan 62
            let cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = '62' + cleanPhone.substring(1);
            }
            
            const jid = `${cleanPhone}@s.whatsapp.net`;
            
            if (sock) {
                // Trik "Sedang Mengetik / Upload"
                await sock.presenceSubscribe(jid);
                await sock.sendPresenceUpdate('composing', jid);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await sock.sendPresenceUpdate('paused', jid);

                // Kirim Dokumen PDF via URL
                await sock.sendMessage(jid, { 
                    document: { url: document },
                    mimetype: 'application/pdf',
                    fileName: filename || 'Nota.pdf',
                    caption: caption || ''
                });
                console.log(`📤 Sukses kirim dokumen PDF ke ${cleanPhone}`);
            } else {
                 console.log('❌ Gagal kirim dokumen: WhatsApp belum terhubung.');
            }
        } catch (err) {
            console.log('❌ Gagal kirim dokumen WA latar belakang:', err.message);
        }
    })();
});

startWA();
app.listen(3001, () => console.log('🚀 WA Gateway Berjalan di Port 3001'));