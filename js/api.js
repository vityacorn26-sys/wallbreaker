const API = {
  BASE_URL: 'https://api.setgot.qzz.io',

  getInitData() {
    try {
      return window.Telegram?.WebApp?.initData || '';
    } catch (e) {
      return '';
    }
  },

  async post(endpoint, extraBody = {}) {
    const initData = this.getInitData();

    const response = await fetch(`${this.BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ initData, ...extraBody })
    });

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      const err = new Error(data?.error || `Request failed: ${endpoint}`);
      err.status = response.status;
      err.payload = data;
      throw err;
    }

    return data;
  },

  async getUser() {
    try {
      return await this.post('/api/user');
    } catch (e) {
      console.error('API Error (getUser):', e);
      return null;
    }
  },

  async sendTap() {
    try {
      return await this.post('/api/tap');
    } catch (e) {
      console.error('API Error (sendTap):', e);
      return null;
    }
  },

  /* НОВОЕ */
  async sendTapBatch(count) {
    try {
      return await this.post('/api/tap-batch', { count });
    } catch (e) {
      console.error('API Error (sendTapBatch):', e);
      return null;
    }
  },

  async checkAdLimit() {
    try {
      return await this.post('/api/ad-limit');
    } catch (e) {
      console.error('API Error (checkAdLimit):', e);
      return { canWatch: false };
    }
  },

  async claimAdReward() {
    try {
      return await this.post('/api/ad-reward');
    } catch (e) {
      console.error('API Error (claimAdReward):', e);
      return { success: false };
    }
  },

  async getLeaderboard() {
    try {
      const response = await fetch(`${this.BASE_URL}/api/leaderboard`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Leaderboard failed');
      }

      return await response.json();
    } catch (e) {
      console.error('API Error (getLeaderboard):', e);
      return [];
    }
  }
};
