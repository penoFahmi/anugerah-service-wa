const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const pino = require("pino");

const app = express();
app.use(express.json());

const API_TOKEN = "anugerah2026";
const LARAVEL_WEBHOOK_URL = "http://127.0.0.1:8000/api/message";

let sock;
let lastQR = null;

// HELPER FUNCTIONS
function extractCleanPhoneNumber(messageObject) {
  let rawJid = messageObject.key.remoteJid;
  let participantJid = messageObject.key.participant || rawJid;

  if (
    messageObject.key.remoteJidAlt &&
    messageObject.key.remoteJidAlt.includes("@s.whatsapp.net")
  ) {
    participantJid = messageObject.key.remoteJidAlt;
  }
  return participantJid.split("@")[0].split(":")[0];
}

function getMessageType(messageContent) {
  if (!messageContent) return "unknown";
  if (messageContent.conversation || messageContent.extendedTextMessage)
    return "text";
  if (messageContent.imageMessage) return "image";
  if (messageContent.documentMessage) return "document";
  if (messageContent.audioMessage) return "voice_note";
  if (messageContent.videoMessage) return "video";
  if (messageContent.stickerMessage) return "sticker";
  if (messageContent.contactsArrayMessage || messageContent.contactMessage)
    return "contact";
  if (messageContent.locationMessage) return "location";
  return "other";
}

function extractMessageText(messageContent) {
  if (!messageContent) return "";
  if (messageContent.conversation) return messageContent.conversation;
  if (
    messageContent.extendedTextMessage &&
    messageContent.extendedTextMessage.text
  )
    return messageContent.extendedTextMessage.text;
  if (messageContent.imageMessage && messageContent.imageMessage.caption)
    return messageContent.imageMessage.caption;
  if (messageContent.documentMessage && messageContent.documentMessage.fileName)
    return messageContent.documentMessage.fileName;
  return "";
}

function checkToken(req, res, next) {
  const token = req.headers["x-token"];
  if (token !== API_TOKEN) {
    return res.status(401).json({ error: "Akses Ditolak. Token tidak valid." });
  }
  next();
}

// WHATSAPP CORE LOGIC
async function startWA() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: "silent" }),
    browser: ["Anugerah ERP", "Chrome", "1.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) lastQR = qr;

    if (connection === "open") {
      console.log("[System] WhatsApp Connected and Ready.");
      lastQR = null;
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log(
          "[System] Koneksi terputus. Mencoba menghubungkan kembali...",
        );
        setTimeout(startWA, 3000);
      } else {
        console.log(
          "[System] Sesi WhatsApp telah Logout. Silakan hapus folder auth dan scan ulang QR.",
        );
      }
    }
  });

  // Kirim Pesan Masuk ke Laravel
  sock.ev.on("messages.upsert", async (msg) => {
    const m = msg.messages[0];

    // Cegat pesan sistem WhatsApp, distribusi kunci, ATAU BROADCAST STATUS (Story WA)
    if (
      !m.message ||
      m.message.protocolMessage ||
      m.message.senderKeyDistributionMessage ||
      m.key.remoteJid === "status@broadcast" // Mencegah bot merespon Status WA orang
    )
      return;

    // Cegat pesan dari Grup WA
    if (m.key.remoteJid && m.key.remoteJid.includes("@g.us")) return;
    // -----------------------

    try {
      const senderPhone = extractCleanPhoneNumber(m);
      const pushName = m.pushName || "Unknown";
      const messageType = getMessageType(m.message);
      let extractedText = extractMessageText(m.message);
      const isFromMe = m.key.fromMe || false;

      // Berikan label khusus jika pesan kosong (berupa media)
      if (!extractedText.trim()) {
        if (messageType === "image") extractedText = "[Gambar]";
        else if (messageType === "voice_note") extractedText = "[Voice Note]";
        else if (messageType === "sticker") extractedText = "[Stiker]";
        else if (messageType === "document") extractedText = "[Dokumen]";
        else if (messageType === "location") extractedText = "[Lokasi]";
        else if (messageType === "contact") extractedText = "[Kontak]";
        else if (messageType === "video") extractedText = "[Video]";
        else return; // Abaikan pesan jika tidak diketahui tipenya
      }

      const cleanText = extractedText.trim();
      console.log(
        `[${isFromMe ? "Outbound HP" : "Inbound"}] ${senderPhone}: "${cleanText}"`,
      );

      // Teruskan pesan bersih ke Webhook Laravel
      await axios.post(
        LARAVEL_WEBHOOK_URL,
        {
          id: m.key.id,
          phone: senderPhone,
          pushName: pushName,
          type: messageType,
          message: cleanText,
          isFromMe: isFromMe,
        },
        {
          headers: { "X-Token": API_TOKEN },
        },
      );
    } catch (err) {
      console.log("[Error] Gagal meneruskan pesan ke Laravel:", err.message);
    }
  });
}

// EXPRESS ENDPOINTS QR
app.get("/status", (req, res) => {
  res.json({
    isConnected: !!sock?.user,
    qr: lastQR,
    number: sock?.user?.id.split(":")[0] || null,
  });
});

// Logout dan Hapus Sesi WhatsApp
app.post("/logout", checkToken, async (req, res) => {
  try {
    if (sock) await sock.logout();
  } catch (e) {}
  if (fs.existsSync("./auth"))
    fs.rmSync("./auth", { recursive: true, force: true });
  lastQR = null;
  sock = null;
  startWA();
  res.json({ status: "logged_out" });
});

// Kirim Pesan Teks ke Nomor WhatsApp
app.post("/send-message", checkToken, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message)
    return res
      .status(400)
      .json({ error: "Parameter phone dan message wajib diisi." });
  if (!sock || !sock.user)
    return res.status(503).json({ error: "WhatsApp offline." });

  try {
    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "62" + cleanPhone.substring(1);
    const jid = `${cleanPhone}@s.whatsapp.net`;

    // [FIX] COLD START: Paksa server WA mengecek nomor ini sebelum mengirim
    const [result] = await sock.onWhatsApp(jid);
    if (!result || !result.exists) {
      return res
        .status(404)
        .json({ error: "Nomor tidak terdaftar di WhatsApp." });
    }

    const sentMsg = await sock.sendMessage(result.jid, { text: message });
    console.log(`[Outbound API] Pesan terkirim ke ${result.jid}.`);

    // [FIX] PESAN HANTU: Kirim response SUKSES dan bawa ID Pesan aslinya
    res.json({ status: "sent", messageId: sentMsg.key.id });
  } catch (err) {
    console.log(`[Error] Gagal mengirim pesan ke ${phone}: ${err.message}`);
    res.status(500).json({ error: "Gagal mengirim ke jaringan WA." });
  }
});

// Kirim Dokumen (PDF) ke Nomor WhatsApp
app.post("/send-document", checkToken, async (req, res) => {
  const { phone, caption, document, filename } = req.body;
  if (!phone || !document)
    return res.status(400).json({ error: "Parameter wajib diisi." });
  if (!sock || !sock.user)
    return res.status(503).json({ error: "WhatsApp offline." });

  try {
    let cleanPhone = phone.replace(/[^0-9]/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "62" + cleanPhone.substring(1);
    const jid = `${cleanPhone}@s.whatsapp.net`;

    // [FIX] COLD START
    const [result] = await sock.onWhatsApp(jid);
    if (!result || !result.exists)
      return res.status(404).json({ error: "Nomor tidak valid." });

    const sentMsg = await sock.sendMessage(result.jid, {
      document: { url: document },
      mimetype: "application/pdf",
      fileName: filename || "Dokumen.pdf",
      caption: caption || "",
    });
    res.json({ status: "sent", messageId: sentMsg.key.id });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengirim dokumen." });
  }
});

// JALANKAN SERVER
startWA();
app.listen(3001, () =>
  console.log("[System] WhatsApp Gateway Berjalan di Port 3001"),
);
