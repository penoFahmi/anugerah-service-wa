const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const app = express();
app.use(express.json());

const API_TOKEN = 'anugerah2026';
const LARAVEL_WEBHOOK_URL = 'http://127.0.0.1:8000/api/message';
const LOG_FILE_PATH = path.join(__dirname, 'wa_debug_logs.jsonl');

let sock;
let lastQR = null;

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function logRawPayload(eventType, payload) {
    try {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event: eventType,
            data: payload
        };
        fs.appendFileSync(LOG_FILE_PATH, JSON.stringify(logEntry) + '\n');
    } catch (error) {
        console.error('[System] Gagal menulis ke file log debug:', error.message);
    }
}

/**
 * [UPDATE]
 * Mengekstrak nomor telepon murni (628xxx) dari payload Baileys yang rumit.
 * Memprioritaskan remoteJidAlt jika ID utamanya adalah @lid (Linked Device).
 */
function extractCleanPhoneNumber(messageObject) {
    let rawJid = messageObject.key.remoteJid;
    let participantJid = messageObject.key.participant || rawJid;
    
    if (messageObject.key.remoteJidAlt && messageObject.key.remoteJidAlt.includes('@s.whatsapp.net')) {
        participantJid = messageObject.key.remoteJidAlt;
    }
    
    // Potong karakter @... dan :...
    let cleanNumber = participantJid.split('@')[0].split(':')[0];
    
    return cleanNumber;
}

function getMessageType(messageContent) {
    if (!messageContent) return 'unknown';
    
    if (messageContent.conversation || messageContent.extendedTextMessage) return 'text';
    if (messageContent.imageMessage) return 'image';
    if (messageContent.documentMessage) return 'document';
    if (messageContent.audioMessage) return 'voice_note';
    if (messageContent.videoMessage) return 'video';
    if (messageContent.stickerMessage) return 'sticker';
    if (messageContent.contactsArrayMessage || messageContent.contactMessage) return 'contact';
    if (messageContent.locationMessage) return 'location';
    
    return 'other';
}

function extractMessageText(messageContent) {
    if (!messageContent) return '';
    
    if (messageContent.conversation) {
        return messageContent.conversation;
    }
    if (messageContent.extendedTextMessage && messageContent.extendedTextMessage.text) {
        return messageContent.extendedTextMessage.text;
    }
    if (messageContent.imageMessage && messageContent.imageMessage.caption) {
        return messageContent.imageMessage.caption;
    }
    if (messageContent.documentMessage && messageContent.documentMessage.fileName) {
        return messageContent.documentMessage.fileName;
    }
    
    return '';
}

function checkToken(req, res, next) {
    const token = req.headers['x-token'];
    if (token !== API_TOKEN) {
        return res.status(401).json({ error: 'Akses Ditolak. Token tidak valid.' });
    }
    next();
}
// ==========================================
// WHATSAPP CORE LOGIC
// ==========================================

async function startWA() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true, // QR Tetap muncul di Terminal
        logger: pino({ level: 'silent' }), 
        browser: ['Anugerah ERP', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        // Simpan QR terbaru ke variabel agar bisa diambil Laravel
        if (qr) lastQR = qr;

        if (connection === 'open') {
            console.log('[System] WhatsApp Connected and Ready.');
            lastQR = null; // Kosongkan QR kalau sudah konek
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log('[System] Koneksi terputus. Mencoba menghubungkan kembali...');
                setTimeout(startWA, 3000);
            } else {
                console.log('[System] Sesi WhatsApp telah Logout. Silakan hapus folder auth dan scan ulang QR.');
            }
        }
    });

    sock.ev.on('call', async (callData) => {
        logRawPayload('incoming_call', callData);
        console.log('[System] Mendapatkan panggilan masuk. Data direkam ke log.');
    });

    sock.ev.on('messages.upsert', async (msg) => {
        const m = msg.messages[0];

        logRawPayload('incoming_message', m);

        if (m.key.remoteJid.includes('@g.us')) return;

        const senderPhone = extractCleanPhoneNumber(m);
        const pushName = m.pushName || 'Unknown';
        const messageType = getMessageType(m.message);
        let extractedText = extractMessageText(m.message);

        const isFromMe = m.key.fromMe; 

        if (!extractedText.trim()) {
            if (messageType === 'image') extractedText = '[Gambar tanpa keterangan]';
            else if (messageType === 'voice_note') extractedText = '[Pesan Suara / Voice Note]';
            else if (messageType === 'sticker') extractedText = '[Stiker]';
            else if (messageType === 'document') extractedText = '[Dokumen]';
            else return; 
        }

        // console.log(`[Inbound] Pesan dari ${senderPhone} (${pushName}) | Tipe: ${messageType}`);

        console.log(`[${isFromMe ? 'Outbound HP' : 'Inbound'}] Pesan: "${extractedText.trim()}"`);

        try {
            await axios.post(LARAVEL_WEBHOOK_URL, {
                phone: senderPhone,
                pushName: pushName,
                type: messageType,
                message: extractedText.trim(),
                isFromMe: isFromMe 
            }, {
                headers: { 'X-Token': API_TOKEN }
            });
        } catch (err) {
            console.log('[Error] Gagal meneruskan pesan ke Laravel.');
        }
    });
}

// ==========================================
// EXPRESS ENDPOINTS (UNTUK LARAVEL)
// ==========================================

// 1. Endpoint untuk menampilkan QR di Laravel (KEMBALI DITAMBAHKAN)
app.get('/status', (req, res) => {
    res.json({
        isConnected: !!sock?.user,
        qr: lastQR,
        number: sock?.user?.id.split(':')[0] || null
    });
});

// 2. Endpoint untuk Logout dari Laravel (KEMBALI DITAMBAHKAN)
app.post('/logout', checkToken, async (req, res) => {
    console.log('[System] Menerima perintah instruksi Logout.');
    try {
        if (sock) await sock.logout();
    } catch (e) {}

    if (fs.existsSync('./auth')) {
        fs.rmSync('./auth', { recursive: true, force: true });
        console.log('[System] Folder sesi autentikasi berhasil dihapus.');
    }

    lastQR = null; 
    sock = null;
    startWA();
    
    res.json({ status: 'logged_out' });
});

// ==========================================
// ENDPOINT KIRIM TEKS
// ==========================================
app.post('/send-message', checkToken, (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'Parameter phone dan message wajib diisi.' });

    res.json({ status: 'queued' });

    (async () => {
        try {
            let cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.substring(1);
            const jid = `${cleanPhone}@s.whatsapp.net`;
            
            if (sock) {
                await sock.sendMessage(jid, { text: message });
                console.log(`[Outbound] Pesan terkirim ke ${jid}.`);
            }
        } catch (err) {
            console.log(`[Error] Gagal mengirim pesan: ${err.message}`);
        }
    })();
});

// ==========================================
// ENDPOINT KIRIM PDF
// ==========================================
app.post('/send-document', checkToken, (req, res) => {
    const { phone, caption, document, filename } = req.body;
    if (!phone || !document) return res.status(400).json({ error: 'Parameter phone dan document wajib diisi.' });

    res.json({ status: 'queued' });

    (async () => {
        try {
            let cleanPhone = phone.replace(/[^0-9]/g, '');
            if (cleanPhone.startsWith('0')) cleanPhone = '62' + cleanPhone.substring(1);
            const jid = `${cleanPhone}@s.whatsapp.net`;
            
            if (sock) {
                await sock.sendMessage(jid, { 
                    document: { url: document },
                    mimetype: 'application/pdf',
                    fileName: filename || 'Dokumen.pdf',
                    caption: caption || ''
                });
                console.log(`[Outbound] Dokumen terkirim ke ${jid}.`);
            }
        } catch (err) {
            console.log(`[Error] Gagal mengirim dokumen: ${err.message}`);
        }
    })();
});

startWA();
app.listen(3001, () => console.log('[System] WhatsApp Gateway berjalan di Port 3001.'));