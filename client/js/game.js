// Глобальные переменные
let tg, userId, userState = { balance: 0, energy: 100, rank_id: 1 };
let currentLang = 'RU';

const i18n = {
    RU: {
        energy: "ЭНЕРГИЯ",
        ads_ok: "Взломано! +1500 WBC",
        refs: "РЕФЕРАЛЫ (10%)",
        top: "ЛИДЕРБОРД",
        market: "ДАРКНЕТ-МАРКЕТ",
        close: "ЗАКРЫТЬ",
        buy_msg: "Выбери инъекцию ранга:"
    },
    EN: {
        energy: "ENERGY",
        ads_ok: "Breach! +1500 WBC",
        refs: "REFERRALS (10%)",
        top: "LEADERBOARD",
        market: "DARKNET-MARKET",
        close: "CLOSE",
        buy_msg: "Select rank injection:"
    }
};

// Глобальные функции для onclick
window.handleTap = async () => {
    if (userState.energy <= 0) return;

    const box = document.getElementById('cat-box');
    box.style.transform = "translateY(8px) scale(0.98)";
    setTimeout(() => box.style.transform = "translateY(0) scale(1)", 100);

    try {
        const data = await API.sendTap(userId);
        if (data && data.balance !== undefined) {
            userState.balance = data.balance;
            userState.energy = data.energy;
            updateUI();
        } else {
            alert("Тап не засчитан — сервер не ответил");
        }
    } catch (e) {
        alert("Ошибка тапа: " + e.message);
    }
};

window.toggleMenu = () => {
    document.getElementById('sidebar').classList.toggle('active');
};

window.setLang = (lang) => {
    currentLang = lang;
    document.getElementById('lang-ru').classList.toggle('active-lang', lang === 'RU');
    document.getElementById('lang-en').classList.toggle('active-lang', lang === 'EN');
    updateUI(); // обновляем текст
};

window.showAds = async () => {
    if (!window.Adsgram) {
        alert("Adsgram SDK не загрузился. Проверь интернет и перезагрузи бота.");
        return;
    }

    const limit = await API.checkAdLimit(userId);
    if (!limit.canWatch) {
        alert(`Лимит рекламы:\n${limit.adsDay || 0}/30 сегодня\n${limit.adsHour || 0}/10 в час`);
        return;
    }

    try {
        const AdController = Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID || "24607" });
        await AdController.show();
        const res = await API.claimAdReward(userId);
        if (res.success) {
            tg.showAlert(i18n[currentLang].ads_ok);
            userState.balance = res.balance;
            userState.energy = res.energy;
            updateUI();
        } else {
            alert(res.message || "Ошибка награды");
        }
    } catch (err) {
        alert("Ошибка рекламы: " + (err.message || err));
    }
};

window.showRefs = () => {
    const refLink = `https://t.me/${tg.initDataUnsafe?.bot_username || 'WallBreakerGame_bot'}?start=${userId}`;
    tg.showAlert(`${i18n[currentLang].refs}\nСсылка: ${refLink}\nБонус: 10% монет`);
};

window.showLeaderboard = () => {
    tg.showAlert(currentLang === 'RU' ? "Топ формируется..." : "Leaderboard forming...");
};

window.showRanks = () => {
    tg.showPopup({
        title: i18n[currentLang].market,
        message: i18n[currentLang].buy_msg,
        buttons: [
            {id: 'r3', type: 'default', text: 'RANK 3 — 0.5 TON (только TON)'},
            {id: 'cancel', type: 'destructive', text: i18n[currentLang].close}
        ]
    }, (buttonId) => {
        if (buttonId === 'r3') {
            const tonUri = `ton://transfer/${CONFIG.MY_TON_WALLET}?amount=500000000&text=rank3_${userId}`;
            tg.openLink(tonUri);
        }
    });
};

window.openMarket = window.showRanks; // для совместимости с другими кнопками

function updateUI() {
    document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
    document.getElementById('energy-fill').style.width = (userState.energy / 100 * 100) + "%";
    document.getElementById('energy-text').innerText = `${i18n[currentLang].energy}: ${userState.energy}`;

    const rankData = CONFIG.RANKS?.[userState.rank_id] || CONFIG.RANKS[1];
    document.getElementById('cat-img').src = rankData.img;
    document.getElementById('bg-layer').style.backgroundImage = `url(${rankData.img})`;
}

// Старт
async function init() {
    try {
        tg = window.Telegram.WebApp;
        tg.expand();
        tg.ready();
        userId = tg.initDataUnsafe?.user?.id?.toString() || "dev_user";

        const data = await API.getUser(userId);
        if (data) {
            userState = { ...userState, ...data };
        }

        updateUI();
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        document.getElementById('menu-btn').style.display = 'flex';
        document.getElementById('bg-layer').style.display = 'block';
    } catch (e) {
        alert("Критическая ошибка запуска: " + e.message);
    }
}

init();
