'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// .env faylini o'qish (dotenv paketisiz)
if (fs.existsSync('.env')) {
  const envConfig = fs.readFileSync('.env', 'utf8');
  for (const line of envConfig.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...vals] = trimmed.split('=');
      const val = vals.join('=').replace(/^['"]|['"]$/g, '');
      if (!process.env[key.trim()]) process.env[key.trim()] = val.trim();
    }
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '9249309686:AAGi_a_H30qzf2q-LQyzF1yxmhgaDtQwTDc';
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'SardorArt_bot';
const SITE_URL = process.env.SITE_URL || `http://localhost:${PORT}`;

const DATA_FILE = path.join(__dirname, 'data.json');
let DATA = { users: {}, sessions: {}, authNonces: {}, products: [], orders: [] };
let writeQueue = Promise.resolve();

// Atomik yozish (tmp fayl + rename)
async function saveData() {
  writeQueue = writeQueue.then(async () => {
    const tmp = DATA_FILE + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(DATA, null, 2));
    await fs.promises.rename(tmp, DATA_FILE);
  }).catch(console.error);
  return writeQueue;
}

// Ma'lumotlarni yuklash
async function loadData() {
  try {
    const raw = await fs.promises.readFile(DATA_FILE, 'utf8');
    DATA = JSON.parse(raw);
    if (!DATA.users) DATA.users = {};
    if (!DATA.sessions) DATA.sessions = {};
    if (!DATA.authNonces) DATA.authNonces = {};
    if (!DATA.products) DATA.products = [];
    if (!DATA.orders) DATA.orders = [];
  } catch (e) {
    await saveData();
  }
}

// Telegram Botga xabar yuborish
async function sendTgMsg(chatId, text, replyMarkup = null) {
  if (!BOT_TOKEN) return;
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) body.reply_markup = replyMarkup;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('Telegram error:', err.message);
  }
}

// Long polling orqali botni eshitish
async function pollUpdates() {
  if (!BOT_TOKEN) return console.log('TELEGRAM_BOT_TOKEN berilmagan. Bot ishlamaydi.');
  let offset = 0;
  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=10`);
      const data = await res.json();
      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          await handleBotUpdate(update);
        }
      }
    } catch (err) {
      console.error('Polling error:', err.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// Bot xabarlarini qayta ishlash
async function handleBotUpdate(update) {
  if (!update.message) return;
  const msg = update.message;
  const chatId = msg.chat.id;

  if (msg.text && msg.text.startsWith('/start ')) {
    const nonce = msg.text.split(' ')[1];
    const auth = DATA.authNonces[nonce];
    if (auth && Date.now() - auth.createdAt < 10 * 60 * 1000) {
      auth.chatId = chatId;
      auth.status = 'waiting_contact';
      await saveData();

      let roleText = auth.role === 'seller' ? 'savdogar' : 'mijoz';
      await sendTgMsg(chatId, `Assalomu alaykum, hurmatli ${roleText}! SARDOR ART ga xush kelibsiz. Davom etish uchun telefon raqamingizni yuboring.`, {
        keyboard: [[{ text: "📱 Raqamni yuborish", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true
      });
    } else {
      await sendTgMsg(chatId, 'Xatolik: Havola eskirgan. Iltimos, saytga qaytib, qaytadan urinib ko\'ring.');
      }
  } 
  else if (msg.contact) {
    let activeNonce = null;
    for (const [nonce, auth] of Object.entries(DATA.authNonces)) {
      if (auth.chatId === chatId && auth.status === 'waiting_contact') {
        activeNonce = nonce; break;
      }
    }
    
    if (activeNonce) {
      const auth = DATA.authNonces[activeNonce];
      if (msg.contact.user_id !== msg.from.id) {
        return sendTgMsg(chatId, 'Iltimos, faqat o\'zingizning raqamingizni yuboring.');
      }

      let phone = msg.contact.phone_number;
      if (!phone.startsWith('+')) phone = '+' + phone;
      
      if (!/^\+998\d{9}$/.test(phone)) {
        return sendTgMsg(chatId, 'Telefon raqami formati noto\'g\'ri (+998XXXXXXXXX).');
      }

      const code = String(crypto.randomInt(100000, 999999));
      auth.phone = phone;
      auth.codeHash = crypto.createHash('sha256').update(code).digest('hex');
      auth.status = 'waiting_code';
      auth.attempts = 0;
      auth.sentAt = Date.now();
      await saveData();

      await sendTgMsg(chatId,` Rahmat! Tasdiqlash kodi:\n\n<code>${code}</code>\n\nIltimos, saytga qaytib shu kodni kiriting.`, {
        remove_keyboard: true
      });
    }
  }
}

// Express sozlash
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '3mb' }));

// Xavfsizlik sarlavhalari
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https://*.googleapis.com https://*.gstatic.com https://www.google.com https://maps.google.com; frame-src https://www.google.com https://maps.google.com; script-src 'self'; style-src 'self' 'unsafe-inline';");
  next();
});

// Rate limit (IP bo'yicha)
const rlBuckets = new Map();
setInterval(() => rlBuckets.clear(), 60000);
function rateLimit(max) {
  return (req, res, next) => {
    const ip = req.ip;
    let b = rlBuckets.get(ip);
    if (!b) { b = { count: 0 }; rlBuckets.set(ip, b); }
    b.count++;
    if (b.count > max) return res.status(429).json({ error: 'Juda ko\'p so\'rov. Iltimos kuting.' });
    next();
  };
}

app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function auth(required = true) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return required ? res.status(401).json({ error: 'Avtorizatsiya talab qilinadi' }) : next();
    const session = DATA.sessions[token];
    if (!session) return res.status(401).json({ error: 'Sessiya eskirgan' });
    const user = DATA.users[session.phone];
    if (!user) return res.status(401).json({ error: 'Foydalanuvchi topilmadi' });
    req.user = user;
    req.token = token;
    next();
  };
}

// === API MARSHRUTLARI ===

// 1. Auth (Telegram)
app.post('/api/auth/start', rateLimit(10), async (req, res) => {
  const { role } = req.body;
  if (!['customer', 'seller'].includes(role)) return res.status(400).json({ error: 'Rol xato' });
  const nonce = crypto.randomBytes(16).toString('hex');
  DATA.authNonces[nonce] = { role, createdAt: Date.now(), status: 'pending' };
  await saveData();
  res.json({ nonce, url: `https://t.me/${BOT_USERNAME}?start=${nonce}` });
});

app.get('/api/auth/status', (req, res) => {
  const auth = DATA.authNonces[req.query.nonce];
  if (!auth) return res.status(404).json({ error: 'Topilmadi' });
  res.json({ status: auth.status });
});

app.post('/api/auth/verify', rateLimit(10), async (req, res) => {
  const { nonce, code } = req.body;
  const auth = DATA.authNonces[nonce];
  
  if (!auth) return res.status(400).json({ error: 'Noto\'g\'ri so\'rov' });
  if (Date.now() - auth.createdAt > 10 * 60 * 1000) return res.status(400).json({ error: 'Muddati o\'tgan' });
  if (auth.status !== 'waiting_code') return res.status(400).json({ error: 'Kutilmagan holat' });
  if (auth.attempts >= 5) return res.status(429).json({ error: 'Juda ko\'p xato urinish' });
  const hash = crypto.createHash('sha256').update(String(code)).digest('hex');
  if (hash !== auth.codeHash) {
    auth.attempts++;
    await saveData();
    return res.status(400).json({ error: 'Kod xato' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  DATA.sessions[token] = { phone: auth.phone, role: auth.role, createdAt: Date.now() };
  DATA.users[auth.phone] = { ...DATA.users[auth.phone], phone: auth.phone, role: auth.role, telegramId: auth.chatId, createdAt: Date.now() };
  
  delete DATA.authNonces[nonce];
  await saveData();

  sendTgMsg(auth.chatId, `✅ Siz muvaffaqiyatli ro'yxatdan o'tdingiz!`, {
    inline_keyboard: [[{ text: "🌐 Saytga qaytish", url: SITE_URL }]]
  });

  res.json({ token });
});

app.get('/api/me', auth(), (req, res) => {
  res.json({ user: { phone: req.user.phone, role: req.user.role } });
});

// 2. Mahsulotlar
app.get('/api/products', (req, res) => {
  let list = DATA.products.filter(p => p.status === 'available');
  const { q, genre } = req.query;
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  if (genre && genre !== 'all') list = list.filter(p => p.genre === genre);
  list.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ products: list.map(p => ({ id: p.id, name: p.name, price: p.price, genre: p.genre, paymentType: p.paymentType, image: p.image })) });
});

app.get('/api/products/:id', (req, res) => {
  const p = DATA.products.find(x => x.id === req.params.id && x.status === 'available');
  if (!p) return res.status(404).json({ error: 'Topilmadi' });
  res.json({ product: { id: p.id, name: p.name, price: p.price, genre: p.genre, paymentType: p.paymentType, image: p.image } });
});

// 3. Savdogar
app.get('/api/seller/products', auth(), (req, res) => {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Ruxsat yo\'q' });
  const list = DATA.products.filter(p => p.sellerPhone === req.user.phone).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ products: list });
});

app.post('/api/seller/products', auth(), rateLimit(20), async (req, res) => {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Ruxsat yo\'q' });
  const { name, price, genre, paymentType, image } = req.body;

  const ALLOWED_GENRES = ['portrait', 'landscape', 'stilllife', 'abstract', 'animal', 'modern'];
  const ALLOWED_PAYMENTS = ['prepay100', 'prepay50', 'postpay100'];

  if (!name || name.length > 80) return res.status(400).json({ error: 'Nom xato' });
  if (!Number.isInteger(price) , price < 1000 , price > 1000000000) return res.status(400).json({ error: 'Narx xato' });
  if (!ALLOWED_GENRES.includes(genre)) return res.status(400).json({ error: 'Janr xato' });
  if (!ALLOWED_PAYMENTS.includes(paymentType)) return res.status(400).json({ error: 'To\'lov turi xato' });
  if (typeof image !==  'string' , !image.startsWith('data:image/') , image.length > 2500000) return res.status(400).json({ error: 'Rasm hajmi yoki formati xato' });

  const id = crypto.randomBytes(8).toString('hex');
  const product = { id, name, price, genre, paymentType, image, sellerPhone: req.user.phone, status: 'available', createdAt: Date.now() };
  DATA.products.push(product);
  await saveData();
  res.json({ product });
});

app.delete('/api/seller/products/:id', auth(), async (req, res) => {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Ruxsat yo\'q' });
  const idx = DATA.products.findIndex(p => p.id === req.params.id && p.sellerPhone === req.user.phone);
  if (idx === -1) return res.status(404).json({ error: 'Topilmadi' });
  DATA.products.splice(idx, 1);
  await saveData();
  res.json({ ok: true });
});

app.get('/api/seller/sold', auth(), (req, res) => {
  if (req.user.role !== 'seller') return res.status(403).json({ error: 'Ruxsat yo\'q' });
  const list = DATA.orders.filter(o => o.sellerPhone === req.user.phone).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ orders: list });
});
// 4. Buyurtmalar
app.post('/api/orders', auth(), rateLimit(10), async (req, res) => {
  if (req.user.role !== 'customer') return res.status(403).json({ error: 'Faqat mijozlar buyurtma bera oladi' });
  const { items, buyerName, buyerPhone, lat, lng } = req.body;

  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Savat bo\'sh' });
  if (!buyerName || buyerName.length > 80) return res.status(400).json({ error: 'Ism xato' });
  if (!/^\+998\d{9}$/.test(buyerPhone)) return res.status(400).json({ error: 'Telefon xato' });
  if (lat < -90 , lat > 90 , lng < -180 || lng > 180)  return res.status(400).json({ error: 'Koordinatalar xato' });

  const createdOrders = [];
  for (const item of items) {
    const p = DATA.products.find(x => x.id === item.id);
    if (!p || p.status !== 'available') return res.status(400).json(`{ error: Asar topilmadi yoki sotilgan: ${item.name || item.id} }`);
    if (!Number.isInteger(item.qty) , item.qty < 1 , item.qty > 99) return res.status(400).json({ error: 'Miqdor xato' });

    p.status = 'sold';
    const order = { id: crypto.randomBytes(8).toString('hex'), productId: p.id, productName: p.name, price: p.price, paymentType: p.paymentType, buyerName, buyerPhone, lat, lng, sellerPhone: p.sellerPhone, createdAt: Date.now() };
    DATA.orders.push(order);
    createdOrders.push(order);

    const seller = DATA.users[p.sellerPhone];
    if (seller && seller.telegramId) {
      const msg = `🎉 Sizning asaringiz sotildi!\n\nAsar: ${p.name}\nNarx: ${p.price.toLocaleString()} so'm\nTo'lov: ${p.paymentType}\nMijoz: ${buyerName}\nTel: ${buyerPhone}\nXarita: https://www.google.com/maps?q=${lat},${lng}`;
      sendTgMsg(seller.telegramId, msg);
    }
  }
  
  await saveData();
  res.json({ ok: true, orders: createdOrders });
});

// Boshlash
(async () => {
  await loadData();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of Object.entries(DATA.authNonces)) {
      if (now - v.createdAt > 10 * 60 * 1000) delete DATA.authNonces[k];
    }
  }, 60000);
  
  app.listen(PORT, () => {
    console.log(`Server ishga tushdi: http://localhost:${PORT}`);
    pollUpdates();
  });
})();