const API = {
    BASE_URL: 'https://api.setgot.qzz.io',

    async getUser(id) {
        try {
            const response = await fetch(`${this.BASE_URL}/api/user?id=${id}`);
            if (!response.ok) throw new Error('User not found');
            return await response.json();
        } catch (e) {
            console.error("API Error (getUser):", e);
            return null;
        }
    },

    async sendTap(id) {
        try {
            const response = await fetch(`${this.BASE_URL}/api/tap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            if (!response.ok) throw new Error('Tap failed');
            return await response.json();
        } catch (e) {
            console.error("API Error (sendTap):", e);
            return null;
        }
    },

    async claimAdReward(id) {
        try {
            const response = await fetch(`${this.BASE_URL}/api/ad-reward`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
            return await response.json();
        } catch (e) {
            console.error("API Error (AdReward):", e);
            return { success: false };
        }
    }
};
