// Оборачиваем старт в try-catch
let tg, userId;
try {
    tg = window.Telegram.WebApp;
    tg.expand();
    tg.ready();
    userId = tg.initDataUnsafe?.user?.id || "dev_user";
} catch (e) {
    alert("Ошибка Telegram API: " + e.message);
    userId = "dev_user";
}

let userState = { balance: 0, energy: 100, rank_id: 1 };
let currentLang = 'RU';

const i18n = {
    RU: {
        market: "ДАРКНЕТ-МАРКЕТ", close: "ЗАКРЫТЬ", energy: "ЭНЕРГИЯ",
        buy_msg: "ВЫБЕРИТЕ УРОВЕНЬ ИНЪЕКЦИИ:", ads_ok: "Взломано! +1500 WBC",
        refs: "РЕФЕРАЛЫ (10%)", top: "ЛИДЕРБОРД"
    },
    EN: {
        market: "DARKNET-MARKET", close: "CLOSE", energy: "ENERGY",
        buy_msg: "SELECT INJECTION LEVEL:", ads_ok: "Breach! +1500 WBC",
        refs: "REFERRALS (10%)", top: "LEADERBOARD"
    }
};

async function init() {
    try {
        const data = await API.getUser(userId);
        if (data) userState = data;
        
        updateUI();
        updateAdButton();           // ← серая кнопка сразу
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        document.getElementById('menu-btn').style.display = 'flex';
        document.getElementById('bg-layer').style.display = 'block';
    } catch (e) {
        alert("Ошибка сервера при старте: " + e.message);
    }
}

async function handleTap() {
    if (userState.energy <= 0) return;

    const box = document.getElementById('cat-box');
    box.style.transform = "translateY(8px) scale(0.98)";
    setTimeout(() => { box.style.transform = "translateY(0) scale(1)"; }, 100);

    try {
        const data = await API.sendTap(userId);
        if (data && data.balance !== undefined) {
            userState = data;
            updateUI();
        } else {
            alert("Сервер не вернул баланс. Проверь API.");
        }
    } catch (e) {
        alert("Сбой отправки тапа: " + e.message);
    }
}

function updateUI() {
    document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
    document.getElementById('energy-fill').style.width = userState.energy + "%";
    document.getElementById('energy-text').innerText = `${i18n[currentLang].energy}: ${userState.energy}`;
    
    if (typeof CONFIG !== 'undefined' && CONFIG.RANKS) {
        const rankData = CONFIG.RANKS[userState.rank_id || 1];
        document.getElementById('cat-img').src = rankData.img;
        document.getElementById('bg-layer').style.backgroundImage = `url(${rankData.img})`;
    }
}

async function updateAdButton() {
    const limit = await API.checkAdLimit(userId);
    const btn = document.getElementById('btn-ads');
    if (btn) {
        if (!limit.canWatch) {
            btn.classList.add('disabled');
        } else {
            btn.classList.remove('disabled');
        }
    }
}

async function showAds() {
    if (!window.Adsgram) {
        alert("Adsgram не загрузился");
        return;
    }

    const limit = await API.checkAdLimit(userId);
    if (!limit.canWatch) {
        alert(`Лимит рекламы:\n${limit.adsDay || 0}/${limit.maxDay} сегодня\n${limit.adsHour || 0}/${limit.maxHour} в час`);
        return;
    }

    const AdController = window.Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID });
    AdController.show().then(async () => {
        const res = await API.claimAdReward(userId);
        if (res.success) {
            tg.showAlert(i18n[currentLang].ads_ok);
            userState.balance = res.balance;
            userState.energy = res.energy;
            updateUI();
            updateAdButton();
        } else {
            alert(res.message || "Ошибка награды");
        }
    }).catch((err) => alert("Ошибка рекламы: " + err));
}

function showRefs() {
    const refLink = `https://t.me/WallBreakerGame_bot?start=${userId}`;
    tg.showAlert(currentLang === 'RU' ? `Ссылка: ${refLink}\nБонус: 10% монет` : `Link: ${refLink}\nBonus: 10% coins`);
}

function showLeaderboard() {
    tg.showAlert(currentLang === 'RU' ? "Топ-10 хакеров формируется..." : "Top-10 forming...");
}

function openMarket() {
    tg.showPopup({
        title: i18n[currentLang].market,
        message: i18n[currentLang].buy_msg,
        buttons: [
            {id: 'r3', type: 'default', text: 'RANK 3 (0.5 TON)'},
            {id: 'r4', type: 'default', text: 'RANK 4 (1.5 TON)'},
            {id: 'r5', type: 'default', text: 'RANK 5 (3.0 TON)'},
            {id: 'cancel', type: 'destructive', text: i18n[currentLang].close}
        ]
    }, (buttonId) => {
        if (buttonId === 'r3') buyRank(0.5, 3);
        if (buttonId === 'r4') buyRank(1.5, 4);
        if (buttonId === 'r5') buyRank(3.0, 5);
    });
}

function buyRank(amount, rankId) {
    const tonUri = `ton://transfer/${CONFIG.MY_TON_WALLET}?amount=${amount * 1e9}&text=rank${rankId}_${userId}`;
    tg.openLink(tonUri);
}

function toggleMenu() { document.getElementById('sidebar').classList.toggle('active'); }

function setLang(lang) {
    currentLang = lang;
    document.getElementById('lang-ru').classList.toggle('active-lang', lang === 'RU');
    document.getElementById('lang-en').classList.toggle('active-lang', lang === 'EN');
    updateUI();
    if (document.getElementById('sidebar').classList.contains('active')) toggleMenu();
}

// Глобальные функции
window.handleTap = handleTap; window.openMarket = openMarket;
window.showAds = showAds; window.showRefs = showRefs;
window.showLeaderboard = showLeaderboard; window.toggleMenu = toggleMenu;
window.setLang = setLang;

init();
