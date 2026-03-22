const tg = window.Telegram.WebApp;
tg.expand();
const userId = tg.initDataUnsafe.user?.id || "dev_user";

let userState = { balance: 0, energy: 100, rank_id: 1 };

async function init() {
    userState = await API.getUser(userId);
    updateUI();
}

async function handleTap() {
    if (userState.energy <= 0) return;

    // Эффект пружины
    const img = document.getElementById('cat-img');
    img.style.transform = "scale(0.9)";
    setTimeout(() => img.style.transform = "scale(1)", 100);

    const data = await API.sendTap(userId);
    if (data.balance) {
        userState.balance = data.balance;
        userState.energy = data.energy;
        updateUI();
    }
}

function updateUI() {
    document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
    document.getElementById('energy-fill').style.width = userState.energy + "%";
    
    // Динамический фон и кот по рангу из конфига
    const rank = CONFIG.RANKS[userState.rank_id];
    const catImg = document.getElementById('cat-img');
    const bg = document.getElementById('bg-layer');
    
    catImg.src = rank.img;
    bg.style.backgroundImage = `url(${rank.img})`;
}

// Adsgram интеграция
function showAds() {
    const AdController = window.Adsgram.init({ blockId: CONFIG.ADSGRAM_BLOCK_ID });
    AdController.show().then(() => {
        API.claimAdReward(userId).then(data => {
            if (data.success) init(); // Перезагружаем данные
        });
    }).catch(e => console.error("Ad error", e));
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
}

init();
