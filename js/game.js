// Глобальные
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
        buy_msg: "Выбери инъекцию ранга:",
        rank2: "RANK 2 — 30 000 WBC (только монеты)",
        rank3: "RANK 3 — 0.5 TON (только TON)",
        rank4: "RANK 4 — 1.2 TON или 120 000 WBC",
        rank5: "RANK 5 — 2.5 TON или 350 000 WBC"
    },
    EN: {
        energy: "ENERGY",
        ads_ok: "Breach! +1500 WBC",
        refs: "REFERRALS (10%)",
        top: "LEADERBOARD",
        market: "DARKNET-MARKET",
        close: "CLOSE",
        buy_msg: "Select rank injection:",
        rank2: "RANK 2 — 30 000 WBC (coins only)",
        rank3: "RANK 3 — 0.5 TON (TON only)",
        rank4: "RANK 4 — 1.2 TON or 120 000 WBC",
        rank5: "RANK 5 — 2.5 TON or 350 000 WBC"
    }
};

// Глобальные функции
window.handleTap = async () => {
    if (userState.energy <= 0) return;

    document.getElementById('cat-box').style.transform = "translateY(8px) scale(0.98)";
    setTimeout(() => document.getElementById('cat-box').style.transform = "translateY(0) scale(1)", 100);

    try {
        const data = await API.sendTap(userId);
        if (data && data.balance !== undefined) {
            userState.balance = data.balance;
            userState.energy = data.energy;
            updateUI();
        } else {
            alert("Сервер не вернул новые значения после тапа");
        }
    } catch (e) {
        alert("Ошибка тапа: " + e.message);
    }
};

window.toggleMenu = () => document.getElementById('sidebar').classList.toggle('active');

window.setLang = (lang) => {
    currentLang = lang;
    document.getElementById('lang-ru').classList.toggle('active-lang', lang === 'RU');
    document.getElementById('lang-en').classList.toggle('active-lang', lang === 'EN');
    updateUI();
};

window.showAds = async () => {
    if (!window.Adsgram) {
        alert("Adsgram не инициализирован. Перезагрузи бота или проверь интернет.");
        return;
    }

    try {
        const limit = await API.checkAdLimit(userId);
        if (!limit.canWatch) {
            alert(`Лимит: ${limit.adsDay || 0}/30 сегодня, ${limit.adsHour || 0}/10 в час`);
            return;
        }

        const AdController = Adsgram.init({ blockId: "24607" }); // твой blockId
        await AdController.show();
        const res = await API.claimAdReward(userId);
        if (res.success) {
            tg.showAlert(i18n[currentLang].ads_ok);
            userState.balance = res.balance;
            userState.energy = res.energy;
            updateUI();
        } else {
            alert(res.message || "Награда не пришла");
        }
    } catch (err) {
        alert("Adsgram ошибка: " + (err.message || err));
    }
};

window.showRefs = () => {
    const refLink = `https://t.me/WallBreakerGame_bot?start=${userId}`;
    tg.showAlert(`${i18n[currentLang].refs}\nСсылка: ${refLink}\nБонус: 10%`);
};

window.showLeaderboard = () => tg.showAlert("Топ-10 скоро...");

window.showRanks = () => {
    tg.showPopup({
        title: i18n[currentLang].market,
        message: i18n[currentLang].buy_msg,
        buttons: [
            {id: 'r2', type: 'default', text: i18n[currentLang].rank2},
            {id: 'r3', type: 'default', text: i18n[currentLang].rank3},
            {id: 'r4', type: 'default', text: i18n[currentLang].rank4},
            {id: 'r5', type: 'default', text: i18n[currentLang].rank5},
            {id: 'cancel', type: 'destructive', text: i18n[currentLang].close}
        ]
    }, async (buttonId) => {
        if (buttonId === 'r2') {
            // Покупка за WBC — пока просто alert, потом добавим /api/buy
            tg.showAlert("Покупка RANK 2 за 30 000 WBC — подтверди");
        }
        if (buttonId === 'r3') {
            const tonUri = `ton://transfer/ВАШ_КОШЕЛЁК?amount=500000000&text=rank3_${userId}`;
            tg.openLink(tonUri);
        }
        if (buttonId === 'r4' || buttonId === 'r5') {
            tg.showAlert(`Выбери способ: TON или WBC для ${buttonId === 'r4' ? 'RANK 4' : 'RANK 5'}`);
            // Здесь можно добавить второй popup для выбора TON/WBC
        }
    });
};

function updateUI() {
    document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
    document.getElementById('energy-fill').style.width = userState.energy + "%";
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
        if (data) userState = { ...userState, ...data };

        updateUI();
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        document.getElementById('menu-btn').style.display = 'flex';
        document.getElementById('bg-layer').style.display = 'block';
    } catch (e) {
        alert("Ошибка запуска: " + e.message);
    }
}

init();
