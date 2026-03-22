const API = {
    // Твой проверенный поддомен
    BASE_URL: 'https://api.setgot.qzz.io',

    // Получение данных пользователя при входе
    async getUser(id) {
        try {
            const response = await fetch(`${this.BASE_URL}/api/user?id=${id}`);
            if (!response.ok) throw new Error('Network error');
            return await response.json();
        } catch (error) {
            console.error("API: getUser failed", error);
            return null;
        }
    },

    // Отправка тапа на сервер
    async sendTap(id) {
        try {
            const response = await fetch(`${this.BASE_URL}/api/tap`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id })
            });
            if (!response.ok) throw new Error('Tap failed');
            return await response.json();
        } catch (error) {
            console.error("API: sendTap failed", error);
            return null;
        }
    },

    // Начисление за просмотр рекламы (1500 монет + энергия)
    async claimAdReward(id) {
        try {
            const response = await fetch(`${this.BASE_URL}/api/ad-reward`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ id })
            });
            if (!response.ok) throw new Error('Ad reward failed');
            return await response.json();
        } catch (error) {
            console.error("API: claimAdReward failed", error);
            return { success: false };
        }
    },

    // Задел под Лидерборд (будет нужен скоро)
    async getLeaderboard() {
        try {
            const response = await fetch(`${this.BASE_URL}/api/leaderboard`);
            return await response.json();
        } catch (error) {
            return [];
        }
    }
};
