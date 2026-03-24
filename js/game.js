// WallBreaker game.js — полный стабильный вариант (23 марта 2026)

let tg, userId, userState = { balance: 0, energy: 100, rank_id: 1 };

// Инициализация Telegram Web App
tg = window.Telegram.WebApp;
console.log("INIT DATA:", tg.initData);
console.log("UNSAFE:", tg.initDataUnsafe);
tg.expand();
tg.ready();
userId = tg.initDataUnsafe?.user?.id?.toString() || "dev_user";

// Загрузка юзера
async function loadUser() {
  try {
    const res = await fetch('https://api.setgot.qzz.io/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: userId })
    });
    if (!res.ok) throw new Error('User load failed');
    userState = await res.json();
    updateUI();
  } catch (e) {
    console.error('Load user error:', e);
  }
}

// Обновление UI
function updateUI() {
  document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
  document.getElementById('energy-fill').style.width = userState.energy + '%';
  document.getElementById('energy-text').innerText = `ENERGY: ${userState.energy}`;

  // Кот и фон по рангу
  const rankImgs = [
    "assets/cat1.jpg",
    "assets/cat2.jpg",
    "assets/cat3.jpg",
    "assets/cat4.jpg",
    "assets/cat5.jpg"
  ];
  const img = rankImgs[userState.rank_id - 1] || "assets/cat1.jpg";
  document.getElementById('cat-img').src = img;
  document.getElementById('bg-layer').style.backgroundImage = `url(${img})`;
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
    if (!res.ok) throw new Error('Tap failed');
    const data = await res.json();
    if (data.balance !== undefined) {
      userState = data;
      updateUI();
    }
  } catch (e) {
    console.error('Tap error:', e);
  }
};

// Меню-гамбургер
window.toggleMenu = () => {
  document.getElementById('sidebar').classList.toggle('active');
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

// Клик по server.jpg
document.addEventListener('DOMContentLoaded', () => {
  const gateway = document.getElementById('gateway');
  if (gateway) {
    gateway.addEventListener('click', () => {
      window.open('https://t.me/hiddifyProxySale_bot', '_blank');
    });
  }
});

// Реклама
window.showAds = async () => {
    if (!window.Adsgram) {
        alert("Adsgram SDK не загрузился. Перезагрузи бота.");
        return;
    }

    try {
        console.log("Adsgram: начинаем показ, blockId =", CONFIG.ADSGRAM_BLOCK_ID);

        const AdController = Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID });
        await AdController.show();

        console.log("Adsgram: реклама досмотрена, отправляю награду на сервер");

        const response = await fetch(`${CONFIG.API_BASE}/api/ad-reward`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ telegramId: userId })
        });

        console.log("Adsgram: статус ответа =", response.status);

        const data = await response.json();
        console.log("Adsgram: ответ от сервера =", data);

        if (data.success) {
            userState.balance = data.balance || userState.balance;
            userState.energy = 100;
            updateUI();
            alert("Взломано! +1500 WBC и полная энергия");
        } else {
            alert(data.message || "Ошибка начисления награды");
        }
    } catch (err) {
        console.error("Adsgram ошибка:", err);
        alert("Ошибка Adsgram: " + (err.message || "Неизвестная ошибка"));
    }
};

// Старт и реген
loadUser();
setInterval(loadUser, 30000);

// Убираем loading
setTimeout(() => {
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('game-ui').style.display = 'block';
  document.getElementById('menu-btn').style.display = 'flex';
}, 1500);
