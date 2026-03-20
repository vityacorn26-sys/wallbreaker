// 1. Инициализация данных пользователя
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
        energy: "ЭНЕРГИЯ"
    },
    en: {
        nodes: "NODE NETWORK",
        market: "DARKNET MARKET",
        exploit: "LOAD EXPLOIT",
        quests: "SIDE QUESTS",
        top: "TOP BREAKERS",
        laundry: "LAUNDRY (WITHDRAW)",
        inject: "ROOT INJECTION",
        energy: "ENERGY"
    }
};

// 2. Управление загрузкой и меню
window.addEventListener('load', () => {
    // Скрываем загрузку через 1.5 сек
    setTimeout(() => {
        const loader = document.getElementById('loading-screen');
        if (loader) loader.style.display = 'none';
    }, 1500);
});

function toggleMenu() {
    const menu = document.getElementById('side-menu');
    const ham = document.getElementById('ham-menu');
    if (menu && ham) {
        menu.classList.toggle('active');
        ham.classList.toggle('active');
    }
}

function toggleLang() {
    currentLang = currentLang === 'ru' ? 'en' : 'ru';
    const langBtn = document.getElementById('lang-btn');
    if (langBtn) langBtn.innerText = currentLang.toUpperCase();
    updateMenuTexts();
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
}

// 3. Механика Тапов
function handleTap() {
    const now = Date.now();
    // Лимит: 3 тапа в секунду (333мс между кликами)
    if (now - user.lastTap < 333) return;
    if (user.energy <= 0) return;

    user.balance += 10; // Базовая награда за тап
    user.energy -= 1;
    user.lastTap = now;

    updateUI();
    
    // Пружина для кнопки (визуальный отклик)
    const btn = document.getElementById('tap-button');
    if (btn) {
        btn.style.transform = 'scale(0.85) translateY(-10px)';
        setTimeout(() => {
            btn.style.transform = 'scale(1) translateY(0)';
        }, 100);
    }

    // Отправляем данные на сервер (через api.js)
    if (typeof api !== 'undefined') {
        api.sendTap(user.id, 1);
    }
}

// 4. Обновление интерфейса
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

// 5. Фоновое восстановление энергии (1 ед / 30 сек)
setInterval(() => {
    if (user.energy < 100) {
        user.energy++;
        updateUI();
    }
}, 30000);
