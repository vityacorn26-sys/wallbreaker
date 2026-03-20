// 1. Данные пользователя (локально, пока сервер не настроен)
let user = {
    id: window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "local_user",
    balance: 0,
    energy: 100,
    lastTap: 0
};

let currentLang = 'ru';

const langData = {
    ru: {
        nodes: "СЕТЬ УЗЛОВ",
        market: "ДАРКНЕТ МАРКЕТ",
        exploit: "ЗАГРУЗИТЬ ЭКСПЛОИТ",
        quests: "ПОБОЧНЫЕ КВЕСТЫ",
        top: "ТОП БРЕЙКЕРОВ",
        laundry: "ПРАЧЕЧНАЯ",
        inject: "ROOT INJECTION",
        energy: "ЭНЕРГИЯ",
        premium: "Injection: 0.5 TON"
    },
    en: {
        nodes: "NODE NETWORK",
        market: "DARKNET MARKET",
        exploit: "LOAD EXPLOIT",
        quests: "SIDE QUESTS",
        top: "TOP BREAKERS",
        laundry: "LAUNDRY (WITHDRAW)",
        inject: "ROOT INJECTION",
        energy: "ENERGY",
        premium: "Injection: 0.5 TON"
    }
};

// 2. Инициализация при загрузке
window.addEventListener('load', () => {
    // Устанавливаем язык по умолчанию
    updateMenuTexts();
    
    // Скрываем экран загрузки через 1.5 сек
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader) loader.style.display = 'none';
    }, 1500);
});

// 3. Управление меню и языком
function toggleMenu() {
    const menu = document.getElementById('side-menu');
    if (menu) menu.classList.toggle('active');
}

function toggleLang() {
    currentLang = currentLang === 'ru' ? 'en' : 'ru';
    document.getElementById('lang-btn').innerText = currentLang.toUpperCase();
    updateMenuTexts();
    updateUI(); // Чтобы обновить слово "Энергия"
}

function updateMenuTexts() {
    const d = langData[currentLang];
    document.getElementById('menu-ref').innerText = d.nodes;
    document.getElementById('menu-market').innerText = d.market;
    document.getElementById('menu-exploit').innerText = d.exploit;
    document.getElementById('menu-tasks').innerText = d.quests;
    document.getElementById('menu-top').innerText = d.top;
    document.getElementById('menu-laundry').innerText = d.laundry;
    document.getElementById('menu-buy').innerText = d.inject;
    document.getElementById('premium-text').innerText = d.premium;
}

// 4. Механика Тапов
function handleTap() {
    const now = Date.now();
    // Лимит: 3 тапа в секунду (333мс)
    if (now - user.lastTap < 333) return;
    if (user.energy <= 0) return;

    user.balance += 10;
    user.energy -= 1;
    user.lastTap = now;

    updateUI();
    
    // Пружина (эффект нажатия)
    const btn = document.getElementById('tap-button');
    if (btn) {
        btn.style.transform = 'scale(0.92) translateY(-5px)';
        setTimeout(() => { btn.style.transform = 'scale(1) translateY(0)'; }, 100);
    }

    // Отправка на сервер (сохранение будет работать после настройки server.js)
    if (typeof api !== 'undefined') {
        api.sendTap(user.id, 1);
    }
}

// 5. Обновление интерфейса
function updateUI() {
    const d = langData[currentLang];
    const balanceEl = document.getElementById('balance');
    const energyTextEl = document.getElementById('energy-text');
    const energyFillEl = document.getElementById('energy-fill');

    if (balanceEl) balanceEl.innerText = `${user.balance.toLocaleString()} $WBC`;
    if (energyTextEl) energyTextEl.innerText = `${d.energy.toUpperCase()}: ${user.energy}/100`;
    
    if (energyFillEl) {
        let percent = (user.energy / 100) * 100;
        energyFillEl.style.width = percent + '%';
    }
}

// 6. Восстановление энергии (1 ед / 30 сек)
setInterval(() => {
    if (user.energy < 100) {
        user.energy++;
        updateUI();
    }
}, 30000);
