const langData = {
    ru: {
        nodes: "СЕТЬ УЗЛОВ",
        market: "ДАРКНЕТ МАРКЕТ",
        exploit: "ЗАГРУЗИТЬ ЭКСПЛОИТ",
        quests: "ПОБОЧНЫЕ КВЕСТЫ",
        top: "ТОП БРЕЙКЕРОВ",
        laundry: "ПРАЧЕЧНАЯ (ВЫВОД)",
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

let currentLang = 'ru';

function toggleLang() {
    currentLang = currentLang === 'ru' ? 'en' : 'ru';
    document.getElementById('lang-btn').innerText = currentLang.toUpperCase();
    updateMenuTexts();
}

function updateMenuTexts() {
    const d = langData[currentLang];
    document.getElementById('menu-ref').innerText = d.nodes;
    document.getElementById('menu-tasks').innerText = d.quests;
    document.getElementById('menu-buy').innerText = d.inject;
    // Добавь остальные ID по аналогии
}

function handleTap() {
    const now = Date.now();
    if (now - user.lastTap < 333) return; // Лимит 3 тапа/сек
    if (user.energy <= 0) return;

    user.balance += 10; // Это база, потом подтянем из рангов
    user.energy -= 1;
    
    updateUI();
    user.lastTap = now;
    api.sendTap(user.id, 1);
}

function updateUI() {
    const d = langData[currentLang];
    document.getElementById('balance').innerText = `${user.balance.toLocaleString()} $WBC`;
    document.getElementById('energy-text').innerText = `${d.energy}: ${user.energy}/100`;
    let percent = (user.energy / 100) * 100;
    document.getElementById('energy-fill').style.width = percent + '%';
}
