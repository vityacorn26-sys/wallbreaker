const API = {
  BASE_URL: 'https://api.setgot.qzz.io',

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
  }
};

(function () {
  function createDebugBox() {
    if (document.getElementById('wb-debug-initdata-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'wb-debug-initdata-wrap';
    wrap.style.position = 'fixed';
    wrap.style.left = '8px';
    wrap.style.right = '8px';
    wrap.style.bottom = '8px';
    wrap.style.zIndex = '999999';
    wrap.style.background = 'rgba(0, 0, 0, 0.92)';
    wrap.style.border = '1px solid #ff00aa';
    wrap.style.borderRadius = '12px';
    wrap.style.padding = '8px';
    wrap.style.boxShadow = '0 0 18px rgba(255, 0, 170, 0.35)';
    wrap.style.maxHeight = '45vh';
    wrap.style.overflow = 'auto';

    const title = document.createElement('div');
    title.textContent = 'WB DEBUG INITDATA';
    title.style.color = '#00eaff';
    title.style.fontSize = '12px';
    title.style.fontWeight = '700';
    title.style.marginBottom = '6px';

    const ta = document.createElement('textarea');
    ta.id = 'wb-debug-initdata';
    ta.readOnly = true;
    ta.style.width = '100%';
    ta.style.height = '140px';
    ta.style.background = '#05070a';
    ta.style.color = '#d7faff';
    ta.style.border = '1px solid #2c3a4a';
    ta.style.borderRadius = '8px';
    ta.style.padding = '8px';
    ta.style.fontSize = '11px';
    ta.style.boxSizing = 'border-box';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'COPY INITDATA';
    copyBtn.style.marginTop = '8px';
    copyBtn.style.width = '100%';
    copyBtn.style.height = '40px';
    copyBtn.style.border = '0';
    copyBtn.style.borderRadius = '8px';
    copyBtn.style.background = '#ff00aa';
    copyBtn.style.color = '#fff';
    copyBtn.style.fontWeight = '700';

    copyBtn.onclick = async function () {
      try {
        await navigator.clipboard.writeText(ta.value);
        copyBtn.textContent = 'COPIED';
        setTimeout(() => {
          copyBtn.textContent = 'COPY INITDATA';
        }, 1500);
      } catch (e) {
        copyBtn.textContent = 'COPY FAILED';
      }
    };

    wrap.appendChild(title);
    wrap.appendChild(ta);
    wrap.appendChild(copyBtn);
    document.body.appendChild(wrap);
  }
