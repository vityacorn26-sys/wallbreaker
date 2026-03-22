const tg = window.Telegram.WebApp;
tg.expand();

const userId = tg.initDataUnsafe.user?.id || "dev_user";
let userState = { balance: 0, energy: 100, rank_id: 1 };

// Константа билета
const TICKET_PRICE = 2000000;

async function init() {
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/user?id=${userId}`);
        userState = await res.json();
        updateUI();
    } catch (e) { console.error("API Error"); }
}

async function handleTap() {
    if (userState.energy <= 0) return;
    
    const img = document.getElementById('cat-img');
    img.style.transform = "scale(0.92)";
    setTimeout(() => img.style.transform = "scale(1)", 80);

    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/tap`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: userId })
        });
        const data = await res.json();
        userState.balance = data.balance;
        userState.energy = data.energy;
        updateUI();
    } catch (e) {}
}

function showAds() {
    if (!window.Adsgram) return;
    const AdController = window.Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID });
    AdController.show().then(async () => {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/ad-reward`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: userId })
        });
        const data = await res.json();
        if (data.success) {
            tg.showAlert("Система взломана! Награда начислена.");
            init();
        }
    });
}

function buyRank3() {
    const tonUri = `ton://transfer/${CONFIG.MY_TON_WALLET}?amount=${0.5 * 1e9}&text=upgrade_rank3_${userId}`;
    tg.openLink(tonUri);
    tg.showAlert("Ранг активируется после подтверждения в сети TON.");
}

function takeTicket() {
    if (userState.balance < TICKET_PRICE) {
        tg.showAlert(`Недостаточно WBC. Нужно ${TICKET_PRICE.toLocaleString()} для билета.`);
        return;
    }
    tg.showConfirm(`Списать ${TICKET_PRICE.toLocaleString()} WBC для участия в розыгрыше?`, (ok) => {
        if (ok) {
            tg.showAlert("Билет куплен! Результаты в канале.");
            // Тут можно добавить запрос на сервер для списания баланса
        }
    });
}

function updateUI() {
    document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
    document.getElementById('energy-fill').style.width = userState.energy + "%";
    const rank = CONFIG.RANKS[userState.rank_id];
    document.getElementById('cat-img').src = rank.img;
    document.getElementById('bg-layer').style.backgroundImage = `url(${rank.img})`;
}

init();
setInterval(init, 30000);
