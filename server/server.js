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
    lastTap INTEGER
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
    res.json(user);
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

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`WallBreaker Server (SQLite) started on port ${PORT}`);
});
