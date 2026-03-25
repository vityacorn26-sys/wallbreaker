// WallBreaker game.js — secure initData version

let tg;
let userState = { balance: 0, energy: 100, rank_id: 1 };

tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

console.log('INIT DATA:', tg.initData);
console.log('UNSAFE:', tg.initDataUnsafe);

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
  const catImgEl = document.getElementById('cat-img');
  const bgLayerEl = document.getElementById('bg-layer');

  if (balanceEl) balanceEl.innerText = Number(userState.balance || 0).toLocaleString();
  if (energyFillEl) energyFillEl.style.width = `${Math.max(0, Math.min(100, userState.energy || 0))}%`;
  if (energyTextEl) energyTextEl.innerText = `ENERGY: ${userState.energy || 0}`;

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
    updateUI();
    showGameScreen();
  } catch (e) {
    console.error('Load user error:', e);
    showFatalError('User loading error');
  }
}

window.handleTap = async () => {
  if ((userState.energy || 0) <= 0) return;

  const box = document.getElementById('cat-box');
  if (box) {
    box.style.transform = 'scale(0.95)';
    setTimeout(() => {
      box.style.transform = 'scale(1)';
    }, 100);
  }

  try {
    const data = await API.sendTap();

    if (data && data.balance !== undefined) {
      userState.balance = data.balance;
      userState.energy = data.energy;
      userState.rank_id = data.rank_id;
      updateUI();
    }
  } catch (e) {
    console.error('Tap error:', e);
  }
};

window.toggleMenu = () => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('active');
  }
};

window.showRefs = () => {
  const userId = tg.initDataUnsafe?.user?.id?.toString() || '';
  const link = `https://t.me/BypassWallBot/play?start=${userId}`;
  alert(`Реферальная ссылка:\n${link}\nБонус: 10% монет`);
};

window.showLeaderboard = () => {
  alert('Лидерборд формируется...');
};

window.openDarknetMarket = () => {
  alert('Даркнет-маркет:\nRANK 3 — 0.5 TON\nRANK 4–5 — выбор TON или WBC');
};

// Чтобы не падало из-за onclick в index.html
window.openMarket = () => {
  window.openDarknetMarket();
};

window.showRanks = () => {
  window.openDarknetMarket();
};

document.addEventListener('DOMContentLoaded', () => {
  const gateway = document.getElementById('gateway');

  if (gateway) {
    gateway.addEventListener('click', () => {
      window.open('https://t.me/hiddifyProxySale_bot', '_blank');
    });
  }

  loadUser();
});

window.showAds = async () => {
  try {
    const limit = await API.checkAdLimit();

    if (!limit?.canWatch) {
      if (tg?.showAlert) tg.showAlert('Лимит рекламы достигнут');
      return;
    }

    if (!window.Adsgram) {
      if (tg?.showAlert) tg.showAlert('Adsgram SDK не загрузился. Перезагрузи бота.');
      return;
    }

    console.log('Adsgram: начинаем показ, blockId =', CONFIG.ADSGRAM_BLOCK_ID);

    const AdController = Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID });
    await AdController.show();

    console.log('Adsgram: реклама досмотрена, отправляю награду на сервер');

    const reward = await API.claimAdReward();

    if (reward?.success) {
      userState.balance = reward.balance;
      userState.energy = reward.energy;
      updateUI();

      if (tg?.showAlert) tg.showAlert('Награда получена');
    } else {
      if (tg?.showAlert) tg.showAlert('Ошибка начисления награды');
    }
  } catch (e) {
    console.error('Adsgram/showAds error:', e);
    if (tg?.showAlert) tg.showAlert('Реклама не была досмотрена');
  }
};
