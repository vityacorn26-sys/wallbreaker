const API = {
    // Укажи здесь свой поддомен точно!
    BASE_URL: 'https://api.setgot.qzz.io', 

    async getUser(id) {
        const res = await fetch(`${this.BASE_URL}/api/user?id=${id}`);
        return await res.json();
    },

    async sendTap(id) {
        const res = await fetch(`${this.BASE_URL}/api/tap`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id })
        });
        return await res.json();
    },

    async claimAdReward(id) {
        const res = await fetch(`${this.BASE_URL}/api/ad-reward`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id })
        });
        return await res.json();
    }
};
