let tg, userId, userState = { balance: 0, energy: 100, rank_id: 1 };

tg = window.Telegram.WebApp;
tg.expand();
tg.ready();
userId = tg.initDataUnsafe?.user?.id?.toString() || "dev_user";

async function loadUser() {
  try {
    const res = await fetch('https://api.setgot.qzz.io/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: userId })
    });
    userState = await res.json();
    updateUI();
  } catch (e) {
    console.error('Load error:', e);
  }
}

function updateUI() {
  document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
  document.getElementById('energy-fill').style.width = userState.energy + '%';
  document.getElementById('energy-text').innerText = `ENERGY: ${userState.energy}`;
}

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

// Реген каждые 30 секунд
setInterval(loadUser, 30000);

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

// Клик по server.jpg
document.getElementById('gateway')?.addEventListener('click', () => {
  window.open('https://t.me/hiddifyProxySale_bot', '_blank');
});

// Старт
loadUser();
document.getElementById('loading-screen').style.display = 'none';
document.getElementById('game-ui').style.display = 'block';
document.getElementById('menu-btn').style.display = 'flex';
