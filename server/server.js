const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const db = new Database('database.db');

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    telegramId TEXT PRIMARY KEY,
    username TEXT,
    balance INTEGER DEFAULT 0,
    energy INTEGER DEFAULT 100,
    lastTap INTEGER,
    public_nickname TEXT DEFAULT '',
    nickname_manual INTEGER DEFAULT 0,
    nickname_free_used INTEGER DEFAULT 0
  )
`).run();

const userColumns = db.prepare('PRAGMA table_info(users)').all().map((row) => row.name);
const userSchemaUpdates = [
  { name: 'public_nickname', sql: 'ALTER TABLE users ADD COLUMN public_nickname TEXT DEFAULT ""' },
  { name: 'nickname_manual', sql: 'ALTER TABLE users ADD COLUMN nickname_manual INTEGER DEFAULT 0' },
  { name: 'nickname_free_used', sql: 'ALTER TABLE users ADD COLUMN nickname_free_used INTEGER DEFAULT 0' }
];

for (const update of userSchemaUpdates) {
  if (!userColumns.includes(update.name)) {
    try {
      db.prepare(update.sql).run();
    } catch (e) {
      // ignore column already added or incompatible schema state
    }
  }
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS star_nickname_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId TEXT NOT NULL,
    amount INTEGER NOT NULL,
    invoice_payload TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'created',
    new_nickname TEXT DEFAULT '',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    paidAt INTEGER
  )
`).run();

function getOrCreateUser(telegramId, username = '') {
  let user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);

  if (!user) {
    db.prepare(`
      INSERT INTO users (telegramId, username, balance, energy, lastTap)
      VALUES (?, ?, 0, 100, ?)
    `).run(telegramId, username || '', Date.now());

    user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);
  }

  return user;
}

app.post('/api/user', (req, res) => {
  try {
    const { telegramId, username } = req.body;
    const user = getOrCreateUser(telegramId, username);
    res.json({
      ...user,
      public_nickname: String(user.public_nickname || '').trim(),
      nickname_manual: Number(user.nickname_manual || 0),
      nickname_free_used: Number(user.nickname_free_used || 0)
    });
  } catch (e) {
    console.error('/api/user error:', e);
    res.status(500).json({ error: 'User load error' });
  }
});

app.post('/api/tap', (req, res) => {
  try {
    const { telegramId, username } = req.body;
    const user = getOrCreateUser(telegramId, username);

    if (!user || user.energy <= 0) {
      return res.status(400).json({ error: 'No energy' });
    }

    const newBalance = user.balance + 10;
    const newEnergy = user.energy - 1;

    db.prepare(`
      UPDATE users
      SET balance = ?, energy = ?, lastTap = ?
      WHERE telegramId = ?
    `).run(newBalance, newEnergy, Date.now(), telegramId);

    res.json({
      balance: newBalance,
      energy: newEnergy,
      rank_id: 1,
      tapsProcessed: 1
    });
  } catch (e) {
    console.error('/api/tap error:', e);
    res.status(500).json({ error: 'Tap error' });
  }
});

/* НОВОЕ: батч-тап */
app.post('/api/tap-batch', (req, res) => {
  try {
    const { telegramId, username, count } = req.body;

    const requested = Math.max(0, Math.min(50, Number(count || 0)));
    if (!telegramId) {
      return res.status(400).json({ error: 'telegramId required' });
    }
    if (requested <= 0) {
      return res.status(400).json({ error: 'count must be > 0' });
    }

    const user = getOrCreateUser(telegramId, username);

    if (!user || user.energy <= 0) {
      return res.status(400).json({ error: 'No energy' });
    }

    const tapsProcessed = Math.min(user.energy, requested);
    const newBalance = user.balance + (tapsProcessed * 10);
    const newEnergy = user.energy - tapsProcessed;

    db.prepare(`
      UPDATE users
      SET balance = ?, energy = ?, lastTap = ?
      WHERE telegramId = ?
    `).run(newBalance, newEnergy, Date.now(), telegramId);

    res.json({
      balance: newBalance,
      energy: newEnergy,
      rank_id: 1,
      tapsProcessed
    });
  } catch (e) {
    console.error('/api/tap-batch error:', e);
    res.status(500).json({ error: 'Tap batch error' });
  }
});

function isNicknameValid(nickname) {
  const value = String(nickname || '').trim();
  return value.length >= 3 && value.length <= 24;
}

function nicknameExists(nickname, telegramId) {
  return !!db.prepare('SELECT 1 FROM users WHERE public_nickname = ? AND telegramId != ? LIMIT 1').get(nickname, telegramId);
}

app.post('/api/nickname/buy-stars/create', (req, res) => {
  try {
    const { telegramId } = req.body;
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'telegramId required' });
    }

    const payload = `wb_nick_${telegramId}_${Date.now()}`;
    const invoiceLink = `https://t.me/WallBreakerBot?start=${encodeURIComponent(payload)}`;
    const now = Date.now();

    db.prepare(`
      INSERT OR IGNORE INTO star_nickname_payments (
        telegramId,
        amount,
        invoice_payload,
        status,
        createdAt,
        updatedAt
      ) VALUES (?, ?, ?, 'paid', ?, ?)
    `).run(telegramId, 50, payload, now, now);

    return res.json({
      success: true,
      invoice_link: invoiceLink,
      payload
    });
  } catch (e) {
    console.error('/api/nickname/buy-stars/create error:', e);
    return res.status(500).json({ success: false, error: 'stars_create_failed' });
  }
});

app.post('/api/nickname/buy-stars/status', (req, res) => {
  try {
    const { telegramId, payload } = req.body;
    if (!telegramId || !payload) {
      return res.status(400).json({ success: false, error: 'missing_fields' });
    }

    const payment = db.prepare(`
      SELECT * FROM star_nickname_payments
      WHERE invoice_payload = ? AND telegramId = ?
      LIMIT 1
    `).get(payload, telegramId);

    if (!payment) {
      return res.status(404).json({ success: false, error: 'payment_not_found' });
    }

    return res.json({
      success: true,
      payment: {
        status: String(payment.status || 'created'),
        payload: payment.invoice_payload,
        createdAt: Number(payment.createdAt || 0)
      }
    });
  } catch (e) {
    console.error('/api/nickname/buy-stars/status error:', e);
    return res.status(500).json({ success: false, error: 'stars_status_failed' });
  }
});

app.post('/api/nickname/buy-stars/confirm', (req, res) => {
  try {
    const { telegramId, payload, nickname } = req.body;
    if (!telegramId || !payload || !nickname) {
      return res.status(400).json({ success: false, error: 'missing_fields' });
    }

    const payment = db.prepare(`
      SELECT * FROM star_nickname_payments
      WHERE invoice_payload = ? AND telegramId = ?
      LIMIT 1
    `).get(payload, telegramId);

    if (!payment) {
      return res.status(404).json({ success: false, error: 'payment_not_found' });
    }

    if (String(payment.status || '') !== 'paid') {
      return res.status(400).json({ success: false, error: 'payment_not_paid' });
    }

    if (!isNicknameValid(nickname)) {
      return res.status(400).json({ success: false, error: 'nickname_invalid' });
    }

    if (nicknameExists(nickname, telegramId)) {
      return res.status(400).json({ success: false, error: 'nickname_taken' });
    }

    const now = Date.now();
    db.prepare(`
      UPDATE star_nickname_payments
      SET new_nickname = ?, updatedAt = ?
      WHERE invoice_payload = ?
    `).run(nickname, now, payload);

    db.prepare(`
      UPDATE users
      SET public_nickname = ?, nickname_manual = 1, nickname_free_used = 1, lastTap = ?
      WHERE telegramId = ?
    `).run(nickname, now, telegramId);

    return res.json({
      success: true,
      public_nickname: nickname,
      nickname_manual: 1,
      nickname_free_used: 1,
      mode: 'stars',
      price_stars: 50
    });
  } catch (e) {
    console.error('/api/nickname/buy-stars/confirm error:', e);
    return res.status(500).json({ success: false, error: 'nickname_confirm_failed' });
  }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`WallBreaker Server (SQLite) started on port ${PORT}`);
});
