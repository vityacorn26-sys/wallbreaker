// Глобальные переменные
let tg, userId, userState = { balance: 0, energy: 100, rank_id: 1 };

// Инициализация Telegram Web App
tg = window.Telegram.WebApp;
tg.expand();
tg.ready();
userId = tg.initDataUnsafe?.user?.id?.toString() || "dev_user";

// Обновление UI
function updateUI() {
  document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
  document.getElementById('energy-fill').style.width = userState.energy + '%';
  document.getElementById('energy-text').innerText = `ENERGY: ${userState.energy}`;

  // Обновление кота по рангу (если есть CONFIG.RANKS)
  if (window.CONFIG && CONFIG.RANKS && CONFIG.RANKS[userState.rank_id]) {
    const rank = CONFIG.RANKS[userState.rank_id];
    document.getElementById('cat-img').src = rank.img;
  }
}

// Загрузка юзера с сервера (с регеном)
async function loadUser() {
  try {
    const res = await fetch('https://api.setgot.qzz.io/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: userId })
    });
    const data = await res.json();
    if (data.balance !== undefined) {
      userState = data;
      updateUI();
    }
  } catch (e) {
    console.error('Load user error:', e);
  }
}

// Тап
window.handleTap = async () => {
  if (userState.energy <= 0) return;

  const box = document.getElementById('cat-box');
  box.style.transform = 'scale(0.95)';
  setTimeout(() => box.style.transform = 'scale(1)', 100);

  try {
    const res = await fetch('https://api.setgot.qzz.io/api/tap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: userId })
    });
    const data = await res.json();
    if (data.balance !== undefined) {
      userState = data;
      updateUI();
    }
  } catch (e) {
    console.error('Tap error:', e);
  }
};

// Реклама
window.showAds = async () => {
  if (!window.Adsgram) {
    alert('Adsgram не загрузился. Перезагрузи бота.');
    return;
  }

  try {
    const AdController = Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID || '25733' });
    await AdController.show();
    // Награда после просмотра
    const res = await fetch('https://api.setgot.qzz.io/api/ad-reward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: userId })
    });
    const data = await res.json();
    if (data.success) {
      userState.balance = data.balance;
      userState.energy = data.energy || 100;
      updateUI();
      alert('Взломано! +1500 WBC');
    } else {
      alert(data.message || 'Ошибка награды');
    }
  } catch (err) {
    alert('Adsgram ошибка: ' + (err.message || 'Неизвестная ошибка'));
  }
};

// Кнопки шторки
window.showRefs = () => {
  const link = `https://t.me/BypassWallBot/play?start=${userId}`;
  alert(`Реферальная ссылка:\n${link}\nБонус: 10% монет`);
};

window.showLeaderboard = () => {
  alert('Лидерборд формируется...');
};

window.openDarknetMarket = () => {
  alert('Даркнет-маркет:\nRANK 3 — 0.5 TON\nRANK 4–5 — выбор TON или WBC');
};

// Клик по server.jpg → бот-подписок
document.getElementById('gateway')?.addEventListener('click', () => {
  window.open('https://t.me/hiddifyProxySale_bot', '_blank');
});

// Автореген каждые 30 секунд
setInterval(loadUser, 30000);

// Старт
loadUser();
document.getElementById('loading-screen')?.style.display = 'none';
document.getElementById('game-ui')?.style.display = 'block';
document.getElementById('menu-btn')?.style.display = 'flex';
