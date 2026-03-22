const API = {
    async getUser(id) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/user?id=${id}`);
        return await res.json();
    },
    async sendTap(id) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/tap`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id })
        });
        return await res.json();
    },
    async claimAdReward(id) {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/ad-reward`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id })
        });
        return await res.json();
    }
};
