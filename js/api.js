class Api {
    constructor() {
        this.BASE_URL = 'https://wbapi.corterbs.dpdns.org';
    }

    async request(endpoint, data = {}) {
        const response = await fetch(`${this.BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...data, initData: window.Telegram?.WebApp?.initData || "" })
        });
        return await response.json();
    }

    async login(initData) { return await this.request('/api/user/login', { initData }); }
    async getUser() { return await this.request('/api/user/profile'); }
    async updateScore(score) { return await this.request('/api/user/update-score', { score }); }
}
const api = new Api();
