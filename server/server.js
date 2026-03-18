const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Инициализация базы SQLite (создаст файл database.db в этой же папке)
const db = new Database('database.db');

// Создаем таблицу, если её нет
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    telegramId TEXT PRIMARY KEY,
    username TEXT,
    balance INTEGER DEFAULT 0,
    energy INTEGER DEFAULT 100,
    lastTap INTEGER
  )
`).run();

// API: Загрузка юзера
app.post('/api/user', (req, res) => {
    const { telegramId, username } = req.body;
    let user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);
    
    if (!user) {
        db.prepare('INSERT INTO users (telegramId, username, lastTap) VALUES (?, ?, ?)')
          .run(telegramId, username, Date.now());
        user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);
    }
    res.json(user);
});

// API: Обработка тапа
app.post('/api/tap', (req, res) => {
    const { telegramId } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);

    if (!user || user.energy <= 0) {
        return res.status(400).json({ error: 'No energy' });
    }

    const newBalance = user.balance + 10;
    const newEnergy = user.energy - 1;

    db.prepare('UPDATE users SET balance = ?, energy = ?, lastTap = ? WHERE telegramId = ?')
      .run(newBalance, newEnergy, Date.now(), telegramId);

    res.json({ balance: newBalance, energy: newEnergy });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WallBreaker Server (SQLite) started on port ${PORT}`);
});
