let user = {
    id: window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "local_user",
    balance: 0,
    energy: 100,
    lastTap: 0,
    refLink: `https://t.me{window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "123"}`
};

let currentLang = 'ru';

const langData = {
    ru: {
        nodes: "СЕТЬ УЗЛОВ", market: "ДАРКНЕТ МАРКЕТ", exploit: "ЗАГРУЗИТЬ ЭКСПЛОИТ",
        quests: "ПОБОЧНЫЕ КВЕСТЫ", top: "ТОП БРЕЙКЕРОВ", laundry: "ПРАЧЕЧНАЯ",
        inject: "ROOT INJECTION", energy: "ЭНЕРГИЯ", premium: "Injection: 0.5 TON",
        refText: "ТВОЯ ССЫЛКА ДЛЯ ВЕРБОВКИ:",
        marketRules: "РАНГИ: 2 - 150k WBC, 3 - 450k (или 0.5 TON), 4 - 900k, 5 - 1.5M. Каждый ранг действует 7 дней."
    },
    en: {
        nodes: "NODE NETWORK", market: "DARKNET MARKET", exploit: "LOAD EXPLOIT",
        quests: "SIDE QUESTS", top: "TOP BREAKERS", laundry: "LAUNDRY (WITHDRAW)",
        inject: "ROOT INJECTION", energy: "ENERGY", premium: "Injection: 0.5 TON",
        refText: "YOUR RECRUITMENT LINK:",
        marketRules: "RANKS: 2 - 150k WBC, 3 - 450k (or 0.5 TON), 4 - 900k, 5 - 1.5M. Active for 7 days."
    }
};

window.addEventListener('load', () => {
    updateMenuTexts();
    setTimeout(() => { document.getElementById('loading-screen').style.display = 'none'; }, 1500);
});

function toggleMenu() { document.getElementById('side-menu').classList.toggle('active'); }

function toggleLang() {
    currentLang = currentLang === 'ru' ? 'en' : 'ru';
    document.getElementById('lang-btn').innerText = currentLang.toUpperCase();
    updateMenuTexts();
    updateUI();
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

// Открытие разделов
function showSection(type) {
    const modal = document.getElementById('info-modal');
    const content = document.getElementById('modal-content');
    const d = langData[currentLang];
    modal.style.display = 'flex';
    
    if(type === 'ref') {
        content.innerHTML = `<h3>${d.nodes}</h3><p>${d.refText}</p><code style="background:#222;padding:5px;">${user.refLink}</code>`;
    } else if(type === 'market') {
        content.innerHTML = `<h3>${d.market}</h3><p>${d.marketRules}</p>`;
    }
}

function closeModal() { document.getElementById('info-modal').style.display = 'none'; }

function handleTap() {
    const now = Date.now();
    if (now - user.lastTap < 333 || user.energy <= 0) return;
    user.balance += 10; user.energy -= 1; user.lastTap = now;
    updateUI();
}

function updateUI() {
    const d = langData[currentLang];
    document.getElementById('balance').innerText = `${user.balance.toLocaleString()} $WBC`;
    document.getElementById('energy-text').innerText = `${d.energy.toUpperCase()}: ${user.energy}/100`;
    document.getElementById('energy-fill').style.width = (user.energy / 100 * 100) + '%';
}
