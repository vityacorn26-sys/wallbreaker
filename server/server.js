// server/server.js
const express = require('express');
const Datastore = require('nedb');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors()); // Разрешаем запросы с других доменов
app.use(express.json()); // Разрешаем читать JSON в запросах

// Подключаем базу данных (создаст файл database.db)
const db = new Datastore({ filename: 'database.db', autoload: true });

// --- API: ПОЛУЧИТЬ ДАННЫЕ ЮЗЕРА (или создать нового) ---
app.post('/api/user', (req, res) => {
    const { telegramId, username } = req.body;

    if (!telegramId) return res.status(400).send('No ID');

    db.findOne({ telegramId }, (err, user) => {
        if (err) return res.status(500).send(err);

        if (user) {
            // Юзер найден, возвращаем данные
            res.json(user);
        } else {
            // Юзера нет, создаем нового (СТАРТОВЫЙ БАЛАНС)
            const newUser = {
                telegramId,
                username,
                balance: 0,
                energy: 100,
                lastTap: Date.now(),
                wallLevel: 1
            };
            db.insert(newUser, (err, insertedUser) => {
                if (err) return res.status(500).send(err);
                res.json(insertedUser);
            });
        }
    });
});

// --- API: ОБРАБОТКА ТАПА (БЕЗОПАСНОСТЬ!) ---
app.post('/api/tap', (req, res) => {
    const { telegramId } = req.body;

    db.findOne({ telegramId }, (err, user) => {
        if (err || !user) return res.status(400).send('User not found');

        // 1. Простая проверка времени (защита от автокликеров)
        const now = Date.now();
        const timeDiff = now - user.lastTap;
        if (timeDiff < 100) { // Не чаще 10 раз в секунду
            return res.status(429).send('Too fast!');
        }

        // 2. Проверка энергии
        if (user.energy <= 0) {
            return res.status(403).send('No energy');
        }

        // 3. Расчет начисления (10 $WALL за тап)
        const reward = 10;
        const newBalance = user.balance + reward;
        const newEnergy = user.energy - 1;

        // 4. Обновляем в базе
        db.update({ telegramId }, { $set: { balance: newBalance, energy: newEnergy, lastTap: now } }, {}, (err) => {
            if (err) return res.status(500).send(err);
            res.json({ balance: newBalance, energy: newEnergy });
        });
    });
});

// Запускаем сервер
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер WallBreaker запущен на порту ${PORT}`);
});
