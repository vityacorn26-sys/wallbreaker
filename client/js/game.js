const tg = window.Telegram.WebApp;
tg.expand(); // Весь экран
tg.ready();

const userId = tg.initDataUnsafe.user?.id || "test_user";
let userState = { balance: 0, energy: 100, rank_id: 1 };
let currentLang = 'RU';

// Словарь со всеми текстами
const i18n = {
    RU: {
        rank: "ROOT INJECTION: 0.5 TON",
        ads: "ADS INJECTION (+1500)",
        refs: "РЕФЕРАЛЫ (10%)",
        top: "ЛЕДЕРБОРД",
        market: "ДАРКНЕТ-МАРКЕТ",
        community: "COMMUNITY",
        close: "ЗАКРЫТЬ",
        energy: "ЭНЕРГИЯ",
        breach: "Система взломана! +1500 WBC и энергия восстановлена."
    },
    EN: {
        rank: "ROOT INJECTION: 0.5 TON",
        ads: "ADS INJECTION (+1500)",
        refs: "REFERRALS (10%)",
        top: "LEADERBOARD",
        market: "DARKNET-MARKET",
        community: "COMMUNITY",
        close: "CLOSE",
        energy: "ENERGY",
        breach: "System Breach! +1500 WBC and Energy restored."
    }
};

function setLang(lang) {
    currentLang = lang;
    document.getElementById('lang-ru').className = lang === 'RU' ? 'active-lang' : '';
    document.getElementById('lang-en').className = lang === 'EN' ? 'active-lang' : '';
    updateLangUI();
}

function updateLangUI() {
    const t = i18n[currentLang];
    document.getElementById('btn-rank').innerText = t.rank;
    document.getElementById('btn-ads').innerText = t.ads;
    document.getElementById('btn-refs').innerText = t.refs;
    document.getElementById('btn-top').innerText = t.top;
    document.getElementById('btn-market').innerText = t.market;
    document.getElementById('btn-community').innerText = t.community;
    document.getElementById('btn-close').innerText = t.close;
    document.getElementById('energy-text').innerText = t.energy;
}

async function init() {
    try {
        const data = await API.getUser(userId);
        if (data) {
            userState = data;
            updateUI();
            // Скрываем загрузку только когда данные получены
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('game-ui').style.display = 'block';
            document.getElementById('menu-btn').style.display = 'flex';
            document.getElementById('bg-layer').style.display = 'block';
        }
    } catch (e) {
        console.error("Initialization failed. Check server connection.");
    }
}

async function handleTap() {
    if (userState.energy <= 0) return;

    // Визуальный отклик (пружина)
    const img = document.getElementById('cat-img');
    img.style.transform = "scale(0.95)";
    setTimeout(() => { img.style.transform = "scale(1)"; }, 50);

    try {
        const data = await API.sendTap(userId);
        if (data && data.balance !== undefined) {
            userState.balance = data.balance;
            userState.energy = data.energy;
            updateUI();
        }
    } catch (e) {
        console.error("Tap request failed.");
    }
}

function updateUI() {
    document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
    document.getElementById('energy-fill').style.width = userState.energy + "%";
    
    // Обновление кота и фона по рангу из CONFIG
    const rankData = CONFIG.RANKS[userState.rank_id];
    const catImg = document.getElementById('cat-img');
    const bgLayer = document.getElementById('bg-layer');
    
    if (catImg.src !== rankData.img) {
        catImg.src = rankData.img;
        bgLayer.style.backgroundImage = `url(${rankData.img})`;
    }
}

function showAds() {
    if (!window.Adsgram) return;
    const AdController = window.Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID });
    AdController.show().then(async () => {
        const res = await API.claimAdReward(userId);
        if (res.success) {
            tg.showAlert(i18n[currentLang].breach);
            init(); 
        }
    }).catch((err) => {
        console.error("Ads error:", err);
    });
}

function buyRank3() {
    const tonUri = `ton://transfer/${CONFIG.MY_TON_WALLET}?amount=${0.5 * 1e9}&text=rank3_${userId}`;
    tg.openLink(tonUri);
}

function openMarket() {
    tg.showPopup({
        title: i18n[currentLang].market,
        message: currentLang === 'RU' ? 'КУПИТЬ УЛУЧШЕНИЕ:' : 'UPGRADE SYSTEM:',
        buttons: [
            {id: 'r3', type: 'default', text: 'ROOT INJECTION (0.5 TON)'},
            {id: 'cancel', type: 'destructive', text: i18n[currentLang].close}
        ]
    }, (buttonId) => {
        if (buttonId === 'r3') buyRank3();
    });
}

function showRefs() {
    const refLink = `https://t.me/WallBreakerGame_bot?start=${userId}`;
    tg.showAlert(currentLang === 'RU' ? `Ваша ссылка: ${refLink}\nБонус: 10% от тапов друзей!` : `Your link: ${refLink}\nBonus: 10% from friends taps!`);
}

function showLeaderboard() {
    tg.showAlert(currentLang === 'RU' ? "Лидерборд: Топ-10 формируется..." : "Leaderboard: Top-10 forming...");
}

function openCommunity() {
    tg.showAlert(currentLang === 'RU' ? "Канал скоро будет доступен" : "Channel coming soon");
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
}

// Запуск системы
init();
updateLangUI();
setInterval(init, 30000); // Синхронизация каждые 30 сек
