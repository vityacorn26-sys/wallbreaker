const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const userId = tg.initDataUnsafe.user?.id || "dev_user";
let userState = { balance: 0, energy: 100, rank_id: 1 };
let currentLang = 'RU';

const i18n = {
    RU: {
        market: "ДАРКНЕТ-МАРКЕТ",
        close: "ЗАКРЫТЬ",
        energy: "ЭНЕРГИЯ",
        buy_msg: "ВЫБЕРИТЕ УРОВЕНЬ ИНЪЕКЦИИ (RANK):",
        ads_ok: "Система взломана! +1500 WBC и энергия 100%",
        refs: "РЕФЕРАЛЫ (10%)",
        top: "ЛЕДЕРБОРД"
    },
    EN: {
        market: "DARKNET-MARKET",
        close: "CLOSE",
        energy: "ENERGY",
        buy_msg: "SELECT INJECTION LEVEL (RANK):",
        ads_ok: "System Breach! +1500 WBC and Energy 100%",
        refs: "REFERRALS (10%)",
        top: "LEADERBOARD"
    }
};

async function init() {
    const data = await API.getUser(userId);
    if (data) {
        userState = data;
        updateUI();
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        document.getElementById('menu-btn').style.display = 'flex';
        document.getElementById('bg-layer').style.display = 'block';
    }
}

async function handleTap() {
    if (userState.energy <= 0) return;

    // Анимация кнопки (теперь гуляет)
    const box = document.getElementById('cat-box');
    box.style.transform = "translateY(8px) scale(0.98)";
    setTimeout(() => { box.style.transform = "translateY(0) scale(1)"; }, 100);

    const data = await API.sendTap(userId);
    if (data) {
        userState = data;
        updateUI();
    }
}

function updateUI() {
    document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
    document.getElementById('energy-fill').style.width = userState.energy + "%";
    
    // Подгрузка картинки и фона БЕЗ затемнения
    const rankData = CONFIG.RANKS[userState.rank_id];
    const catImg = document.getElementById('cat-img');
    const bgLayer = document.getElementById('bg-layer');
    
    if (catImg.src !== rankData.img) {
        catImg.src = rankData.img;
        bgLayer.style.backgroundImage = `url(${rankData.img})`;
    }
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

function showAds() {
    if (!window.Adsgram) return;
    const AdController = window.Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID });
    AdController.show().then(async () => {
        const res = await API.claimAdReward(userId);
        if (res.success) {
            tg.showAlert(i18n[currentLang].ads_ok);
            init(); 
        }
    }).catch((err) => { console.error("Ads error:", err); });
}

function showRefs() {
    const refLink = `https://t.me/WallBreakerGame_bot?start=${userId}`;
    tg.showAlert(currentLang === 'RU' ? `Ссылка: ${refLink}\nБонус: 10% монет` : `Link: ${refLink}\nBonus: 10% coins`);
}

function showLeaderboard() {
    tg.showAlert(currentLang === 'RU' ? "Топ-10 хакеров формируется..." : "Top-10 hackers forming...");
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
}

function setLang(lang) {
    currentLang = lang;
    document.getElementById('lang-ru').classList.toggle('active-lang', lang === 'RU');
    document.getElementById('lang-en').classList.toggle('active-lang', lang === 'EN');
    updateLangUI();
    if (document.getElementById('sidebar').classList.contains('active')) toggleMenu();
}

function updateLangUI() {
    const t = i18n[currentLang];
    document.getElementById('btn-rank').innerText = t.rank || "ROOT INJECTION";
    document.getElementById('btn-ads').innerText = t.ads || "ADS INJECTION";
    document.getElementById('btn-refs').innerText = t.refs;
    document.getElementById('btn-top').innerText = t.top;
    document.getElementById('btn-market').innerText = t.market;
    document.getElementById('btn-close').innerText = t.close;
    document.getElementById('energy-text').innerText = t.energy;
}

init();
