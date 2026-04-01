const API = {
  BASE_URL: 'https://wbapi.corterbs.dpdns.org',

  getInitData() {
    try {
      return window.Telegram?.WebApp?.initData || '';
    } catch (e) {
      return '';
    }
  },

  getTelegramUser() {
    try {
      return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
    } catch (e) {
      return null;
    }
  },

  async post(endpoint, extraBody = {}) {
    const initData = this.getInitData();
    const tgUser = this.getTelegramUser();

    const telegramId = tgUser?.id ? String(tgUser.id) : '';
    const username = tgUser?.username || '';

    const response = await fetch(`${this.BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        initData,
        telegramId,
        username,
        ...extraBody
      })
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
  },

  async getWithdrawStatus() {
    try {
      return await this.post('/api/withdraw/status');
    } catch (e) {
      console.error('API Error (getWithdrawStatus):', e);
      return { success: false, request: null };
    }
  },

  async requestWithdraw(amount, wallet) {
    try {
      return await this.post('/api/withdraw/request', {
        amount,
        wallet
      });
    } catch (e) {
      console.error('API Error (requestWithdraw):', e);
      return {
        success: false,
        error: e?.payload?.error || e?.message || 'withdraw_failed'
      };
    }
  },

  async buyRank(rankId, currency) {
    try {
      return await this.post('/api/rank/buy', {
        rank_id: rankId,
        currency
      });
    } catch (e) {
      console.error('API Error (buyRank):', e);
      return {
        success: false,
        error: e?.payload?.error || e?.message || 'rank_buy_failed'
      };
    }
  },

  async createTonPurchase(rankId) {
    try {
      return await this.post('/api/rank/buy-ton/create', {
        rank_id: rankId
      });
    } catch (e) {
      console.error('API Error (createTonPurchase):', e);
      return {
        success: false,
        error: e?.payload?.error || e?.message || 'ton_create_failed'
      };
    }
  },

    async confirmTonPurchase(rankId, payload, txHash) {
    try {
      return await this.post('/api/rank/buy-ton/confirm', {
        rank_id: rankId,
        payload,
        tx_hash: txHash
      });
    } catch (e) {
      console.error('API Error (confirmTonPurchase):', e);
      return {
        success: false,
        error: e?.payload?.error || e?.message || 'ton_confirm_failed'
      };
    }
  },

  async createStarsPurchase(rankId) {
    try {
      return await this.post('/api/rank/buy-stars/create', {
        rank_id: rankId
      });
    } catch (e) {
      console.error('API Error (createStarsPurchase):', e);
      return {
        success: false,
        error: e?.payload?.error || e?.message || 'stars_create_failed'
      };
    }
  },

  async getStarsPurchaseStatus(payload) {
    try {
      return await this.post('/api/rank/buy-stars/status', {
        payload
      });
    } catch (e) {
      console.error('API Error (getStarsPurchaseStatus):', e);
      return {
        success: false,
        error: e?.payload?.error || e?.message || 'stars_status_failed'
      };
    }
  }
};

window.API = API;
