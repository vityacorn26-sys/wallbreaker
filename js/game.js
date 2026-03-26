let tg;
let userState = { balance: 0, energy: 100, rank_id: 1 };
let currentLang = 'RU';

let tapQueue = 0;
let tapWorkerRunning = false;
let tapAnimLocked = false;
let tapFlushTimer = null;

tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const I18N = {
  RU: {
    energy: 'ЭНЕРГИЯ',
    adLimit: 'Лимит рекламы достигнут',
    adNotLoaded: 'Adsgram SDK не загрузился.\nПерезагрузи бота.',
    adRewardOk: 'Награда получена',
    adRewardFail: 'Ошибка начисления награды',
    adWatchFail: 'Реклама не была досмотрена',
    refs: 'РЕФЕРАЛЫ (10%)',
    top: 'ЛИДЕРБОРД',
    market: 'ДАРКНЕТ-МАРКЕТ',
    close: 'ЗАКРЫТЬ',
    rank: 'ROOT INJECTION: 0.5 TON',
    ads: 'ADS INJECTION (+1500)',
    leaderboardSoon: 'Лидерборд формируется...',
    marketText: 'Даркнет-маркет:\nRANK 2 — скоро\nRANK 3 — 0.5 TON\nRANK 4–5 — выбор TON или WBC',
    refsText: (link) => `Реферальная ссылка:\n${link}\nБонус: 10% от рекламы`
  },
  EN: {
    energy: 'ENERGY',
    adLimit: 'Ad limit reached',
    adNotLoaded: 'Adsgram SDK not loaded.\nRestart the bot.',
    adRewardOk: 'Reward received',
    adRewardFail: 'Reward credit error',
    adWatchFail: 'Ad was not fully watched',
    refs: 'REFERRALS (10%)',
    top: 'LEADERBOARD',
    market: 'DARKNET MARKET',
    close: 'CLOSE',
    rank: 'ROOT INJECTION: 0.5 TON',
    ads: 'ADS INJECTION (+1500)',
    leaderboardSoon: 'Leaderboard is coming soon...',
    marketText: 'Darknet market:\nRANK 2 — soon\nRANK 3 — 0.5 TON\nRANK 4–5 — TON or WBC',
    refsText: (link) => `Referral link:\n${link}\nBonus: 10% from ads`
  }
};

function t() {
  return I18N[currentLang] || I18N.RU;
}

function applyTexts() {
  const tr = t();

  const refs = document.getElementById('btn-refs');
  const top = document.getElementById('btn-top');
  const market = document.getElementById('btn-market');
  const close = document.getElementById('btn-close');
  const rank = document.getElementById('btn-rank');
  const ads = document.getElementById('btn-ads');

  if (refs) refs.textContent = tr.refs;
  if (top) top.textContent = tr.top;
  if (market) market.textContent = tr.market;
  if (close) close.textContent = tr.close;
  if (rank) rank.textContent = tr.rank;
  if (ads) ads.textContent = tr.ads;

  const ru = document.getElementById('lang-ru');
  const en = document.getElementById('lang-en');

  if (ru) ru.classList.toggle('active-lang', currentLang === 'RU');
  if (en) en.classList.toggle('active-lang', currentLang === 'EN');

  updateUI();
}

window.setLang = (lang) => {
  currentLang = lang === 'EN' ? 'EN' : 'RU';
  applyTexts();
};

function showLoadingScreen() {
  const loadingEl = document.getElementById('loading-screen');
  const gameUiEl = document.getElementById('game-ui');
  const bgLayerEl = document.getElementById('bg-layer');
  const menuBtnEl = document.getElementById('menu-btn');

  if (loadingEl) loadingEl.style.display = 'flex';
  if (gameUiEl) gameUiEl.style.display = 'none';
  if (bgLayerEl) bgLayerEl.style.display = 'none';
  if (menuBtnEl) menuBtnEl.style.display = 'none';
}

function showGameScreen() {
  const loadingEl = document.getElementById('loading-screen');
  const gameUiEl = document.getElementById('game-ui');
  const bgLayerEl = document.getElementById('bg-layer');
  const menuBtnEl = document.getElementById('menu-btn');

  if (loadingEl) loadingEl.style.display = 'none';
  if (gameUiEl) gameUiEl.style.display = 'block';
  if (bgLayerEl) bgLayerEl.style.display = 'block';
  if (menuBtnEl) menuBtnEl.style.display = 'flex';
}

function showFatalError(message) {
  console.error(message);

  const loadingEl = document.getElementById('loading-screen');
  const gameUiEl = document.getElementById('game-ui');
  const balanceEl = document.getElementById('balance-val');
  const energyTextEl = document.getElementById('energy-text');

  if (loadingEl) loadingEl.style.display = 'none';
  if (gameUiEl) gameUiEl.style.display = 'block';
  if (balanceEl) balanceEl.innerText = 'ERROR';
  if (energyTextEl) energyTextEl.innerText = message;

  if (tg?.showAlert) {
    tg.showAlert(message);
  }
}

function updateUI() {
  const balanceEl = document.getElementById('balance-val');
  const energyFillEl = document.getElementById('energy-fill');
  const energyTextEl = document.getElementById('energy-text');
  const energyValueEl = document.getElementById('energy-value');
  const catImgEl = document.getElementById('cat-img');
  const bgLayerEl = document.getElementById('bg-layer');

  const safeBalance = Number(userState.balance || 0);
  const safeEnergy = Math.max(0, Math.min(100, Number(userState.energy || 0)));

  if (balanceEl) balanceEl.innerText = safeBalance.toLocaleString();
  if (energyFillEl) energyFillEl.style.width = `${safeEnergy}%`;
  if (energyTextEl) energyTextEl.innerText = `${t().energy}: ${safeEnergy}`;
  if (energyValueEl) energyValueEl.innerText = `${safeEnergy} / 100`;

  const rankImgs = [
    'assets/cat1.jpg',
    'assets/cat2.jpg',
    'assets/cat3.jpg',
    'assets/cat4.jpg',
    'assets/cat5.jpg'
  ];

  const img = rankImgs[(userState.rank_id || 1) - 1] || 'assets/cat1.jpg';

  if (catImgEl) catImgEl.src = img;
  if (bgLayerEl) bgLayerEl.style.backgroundImage = `url(${img})`;
}

async function loadUser() {
  try {
    showLoadingScreen();

    if (!tg.initData) {
      showFatalError('Telegram initData not found');
      return;
    }

    const data = await API.getUser();
    if (!data) {
      showFatalError('User loading failed');
      return;
    }

    userState = data;
    tapQueue = 0;
    applyTexts();
    showGameScreen();
  } catch (e) {
    console.error('Load user error:', e);
    showFatalError('User loading error');
  }
}

function animateTap() {
  const box = document.getElementById('cat-box');
  if (!box) return;

  if (tapAnimLocked) return;
  tapAnimLocked = true;

  box.style.transform = 'scale(0.985)';

  setTimeout(() => {
    box.style.transform = 'scale(1)';
    tapAnimLocked = false;
  }, 45);
}

async function processTapQueue() {
  if (tapWorkerRunning) return;
  tapWorkerRunning = true;

  try {
    while (tapQueue > 0) {
      const data = await API.sendTap(); // 🔥 ОБРАТНО К ОДИНОЧНОМУ ТАПУ

      tapQueue -= 1;

      if (data && data.balance !== undefined) {
        userState.balance = data.balance;
        userState.energy = data.energy;

        if (data.rank_id !== undefined) {
          userState.rank_id = data.rank_id;
        }

        updateUI();
      } else {
        const fresh = await API.getUser();
        if (fresh) {
          userState = fresh;
          tapQueue = 0;
          updateUI();
        } else {
          tapQueue = 0;
        }
      }
    }
  } catch (e) {
    console.error('Tap queue error:', e);

    tapQueue = 0;

    const fresh = await API.getUser();
    if (fresh) {
      userState = fresh;
      updateUI();
    }
  } finally {
    tapWorkerRunning = false;
  }
}

window.handleTap = () => {
  if ((userState.energy - tapQueue) <= 0) return;

  animateTap();

  tapQueue += 1;

  if (tapFlushTimer) clearTimeout(tapFlushTimer);
  tapFlushTimer = setTimeout(() => {
    processTapQueue();
  }, 90);
};

window.toggleMenu = () => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('active');
};

window.showRefs = () => {
  const userId = tg.initDataUnsafe?.user?.id?.toString() || '';
  const link = `https://t.me/BypassWallBot/play?start=${userId}`;
  alert(t().refsText(link));
};

window.showLeaderboard = () => {
  alert(t().leaderboardSoon);
};

window.openDarknetMarket = () => {
  alert(t().marketText);
};

window.openMarket = () => {
  window.openDarknetMarket();
};

window.showRanks = () => {
  window.openDarknetMarket();
};

document.addEventListener('DOMContentLoaded', () => {
  const gateway = document.getElementById('gateway');

  if (gateway) {
    gateway.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open('https://t.me/hiddifyProxySale_bot', '_blank');
    });
  }

  applyTexts();
  loadUser();
});

window.showAds = async () => {
  try {
    const limit = await API.checkAdLimit();

    if (!limit?.canWatch) {
      if (tg?.showAlert) tg.showAlert(t().adLimit);
      return;
    }

    if (!window.Adsgram) {
      if (tg?.showAlert) tg.showAlert(t().adNotLoaded);
      return;
    }

    const AdController = Adsgram.init({
      blockId: CONFIG.ADSGRAM_BLOCK_ID
    });

    await AdController.show();

    const reward = await API.claimAdReward();

    if (reward?.success) {
      userState.balance = reward.balance;
      userState.energy = reward.energy;
      tapQueue = 0;
      updateUI();

      if (tg?.showAlert) tg.showAlert(t().adRewardOk);
    } else {
      if (tg?.showAlert) tg.showAlert(t().adRewardFail);
    }
  } catch (e) {
    console.error('Adsgram/showAds error:', e);
    if (tg?.showAlert) tg.showAlert(t().adWatchFail);
  }
};
