const api = {
    // Получить данные юзера из твоей базы SQLite
    async getUser(tgData) {
        if (!tgData.user) return null;
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramId: tgData.user.id.toString(),
                    username: tgData.user.username || tgData.user.first_name
                })
            });
            return await response.json();
        } catch (e) {
            console.error("Ошибка API (getUser):", e);
            return null;
        }
    },

    // Отправить тап на сервер
    async sendTap(telegramId) {
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/tap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ telegramId: telegramId.toString() })
            });
            if (!response.ok) throw new Error('Нет энергии');
            return await response.json();
        } catch (e) {
            console.error("Ошибка API (sendTap):", e);
            throw e;
        }
    }
};
