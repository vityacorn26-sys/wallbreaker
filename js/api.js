class Api {
    constructor() {
        this.BASE_URL = 'https://wbapi.corterbs.dpdns.org';
    }

    async request(endpoint, data = {}) {
        try {
            const response = await fetch(`${this.BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, initData: window.Telegram?.WebApp?.initData || "" })
            });
            return await response.json();
        } catch (e) {
            console.error("API Error:", e);
            return { success: false };
        }
    }

    // Исправленные пути согласно твоему grep:
    async login(initData) { return await this.request('/api/user', { initData }); }
    async getUser() { return await this.request('/api/user'); } 
    async updateScore(score) { return await this.request('/api/user/score', { score }); }
}
const api = new Api();
