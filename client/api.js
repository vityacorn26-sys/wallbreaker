const api = {
    // Получить данные пользователя
    async getUser(tgData) {
        const userId = tgData.user?.id;
        if (!userId) return null;
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/user?id=${userId}`);
            return await response.json();
        } catch (e) {
            console.error("Ошибка API (getUser):", e);
            return null;
        }
    },

    // Отправить тап на сервер
    async sendTap(userId) {
        try {
            const response = await fetch(`${CONFIG.API_URL}/api/tap?id=${userId}`);
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Ошибка сервера");
            }
            return await response.json();
        } catch (e) {
            console.error("Ошибка API (sendTap):", e);
            throw e;
        }
    }
};
