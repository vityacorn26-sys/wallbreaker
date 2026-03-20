const api = {
    // Получаем данные юзера при входе
    async getUser(tgData) {
        const userId = tgData?.user?.id;
        if (!userId) return null;
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/user?id=${userId}`);
            return await response.json();
        } catch (e) {
            console.error("Ошибка API (getUser):", e);
            return null;
        }
    },

    // Отправляем тапы (пачкой или по одному)
    async sendTap(userId, count = 1) {
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/tap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: userId, taps: count })
            });
            return await response.json();
        } catch (e) {
            console.error("Ошибка API (sendTap):", e);
            throw e;
        }
    }
};
