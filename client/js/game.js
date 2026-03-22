const tg = window.Telegram.WebApp;
tg.expand(); // Открываем на весь экран
tg.ready();

const userId = tg.initDataUnsafe.user?.id || "dev_user";
let userState = { balance: 0, energy: 100, rank_id: 1 };

// Словарь локализации
const i18n = {
    RU: {
        rank: "ROOT INJECTION: 0.5 TON",
        ads: "ADS INJECTION (+1500)",
        refs: "РЕФЕРАЛЫ / РАНГИ",
        top: "ЛЕДЕРБОРД (Топ-10)",
        market: "ДАРКНЕТ-МАРКЕТ",
        close: "ЗАКРЫТЬ",
        energy: "ЭНЕРГИЯ",
        breach: "Система взломана! +1500 WBC и энергия восстановлена.",
        popup_ticket: "Списать 2,000,000 WBC для участия в розыгрыше?"
    },
    EN: {
        rank: "ROOT INJECTION: 0.5 TON",
        ads: "ADS INJECTION (+1500)",
        refs: "REFERRALS / RANKS",
        top: "LEADERBOARD (Top-10)",
        market: "DARKNET-MARKET",
        close: "CLOSE",
        energy: "ENERGY",
        breach: "System Breach! +1500 WBC and Energy restored.",
        popup_ticket: "Spend 2,000,000 WBC to get a lottery ticket?"
    }
};

let currentLang = 'RU';

function setLang(lang) {
    currentLang = lang;
    document.getElementById('lang-ru').className = lang === 'RU' ? 'active-lang' : '';
    document.getElementById('lang-en').className = lang === 'EN' ? 'active-lang' : '';
    updateLangUI();
    toggleMenu(); // Закрываем меню
}

function updateLangUI() {
    const t = i18n[currentLang];
    document.getElementById('btn-rank').innerText = t.rank;
    document.getElementById('btn-ads').innerText = t.ads;
    document.getElementById('btn-refs').innerText = t.refs;
    document.getElementById('btn-top').innerText = t.top;
    document.getElementById('btn-market').innerText = t.market;
    document.getElementById('btn-close').innerText = t.close;
    document.getElementById('energy-text').innerText = t.energy;
}

// Инициализация при входе
async function init() {
    try {
        userState = await API.getUser(userId);
        updateUI();
        
        // ВСЁ ГОТОВО -> СКРЫВАЕМ ЗАСТАВКУ
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        document.getElementById('menu-btn').style.display = 'flex';
        document.getElementById('bg-layer').style.display = 'block';
        
    } catch (e) { console.error("API Link Lost"); }
}

async function handleTap() {
    if (userState.energy <= 0) return;
    
    // Пружина
    const img = document.getElementById('cat-img');
    img.style.transform = "scale(0.92)";
    setTimeout(() => { img.style.transform = "scale(1)"; }, 100);

    try {
        const data = await API.sendTap(userId);
        if (data.balance) {
            userState.balance = data.balance;
            userState.energy = data.energy;
            updateUI();
        }
    } catch (e) { console.error("Tap error"); }
}

function updateUI() {
    document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
    document.getElementById('energy-fill').style.width = userState.energy + "%";
    
    const rankData = CONFIG.RANKS[userState.rank_id];
    const catImg = document.getElementById('cat-img');
    const bgLayer = document.getElementById('bg-layer');
    
    if (catImg.src !== rankData.img) {
        catImg.src = rankData.img;
        bgLayer.style.backgroundImage = `url(${rankData.img})`;
    }
}

// Изменяем рекламу: Сервер теперь вернет +1500 и Full Energy
function showAds() {
    if (!window.Adsgram) return;
    const AdController = window.Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID });
    AdController.show().then(async () => {
        const res = await API.claimAdReward(userId); // Сервер должен обновить баланс и энергию
        if (res.success) {
            tg.showAlert(i18n[currentLang].breach);
            init(); // Перезагружаем данные
        }
    });
}

function buyRank3() {
    const tonUri = `ton://transfer/${CONFIG.MY_TON_WALLET}?amount=${0.5 * 1e9}&text=upgrade_rank3_${userId}`;
    tg.openLink(tonUri);
    tg.showAlert("Ранг активируется после 1 подтверждения в сети.");
}

function showRefs() {
    const refLink = `https://t.me/WallBreakerGame_bot?start=${userId}`;
    // В будущем: tg.showPopup({ title: 'Refs', message: `Ваша ссылка: ${refLink}` });
    tg.showAlert("Функционал рефералов будет доступен после запуска канала.");
}

function showLeaderboard() {
    // API.getLeaderboard().then(top => { ... });
    tg.showAlert("Лидерборд формируется (Топ-10). Обновление раз в сутки.");
}

// ТВОЙ ДАРКНЕТ-МАРКЕТ
function openMarket() {
    window.open('ССЫЛКА_НА_ДАРКНЕТ_МАРКЕТ_ТУТ');
}

function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
}

init();
updateLangUI();
setInterval(init, 30000); // Синхронизация регена раз в 30 сек
