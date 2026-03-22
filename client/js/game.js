const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// Ждем, пока Telegram скажет, что он готов (чтобы ID точно был)
tg.onEvent('mainButtonClicked', function() { /* Reserved */ });

const userId = tg.initDataUnsafe.user?.id || "dev_user";
let userState = { balance: 0, energy: 100, rank_id: 1 };

// Инициализация
async function init() {
    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/user?id=${userId}`);
        userState = await res.json();
        updateUI();
        
        // ВСЁ ЗАГРУЗИЛОСЬ -> СКРЫВАЕМ ЗАСТАВКУ
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        document.getElementById('menu-btn').style.display = 'flex';
        document.getElementById('bg-layer').style.display = 'block';

    } catch (e) {
        console.error("API Offline", e);
        // Покажем алертом, если API упало
        // tg.showAlert("Ошибка подключения к серверу. Попробуйте позже.");
    }
}

async function handleTap() {
    if (userState.energy <= 0) {
        tg.HapticFeedback.notificationOccurred('error');
        return;
    }
    
    // Пружина
    const img = document.getElementById('cat-img');
    img.style.transform = "scale(0.92)";
    tg.HapticFeedback.impactOccurred('medium');
    setTimeout(() => img.style.transform = "scale(1)", 80);

    try {
        const res = await fetch(`${CONFIG.API_BASE_URL}/api/tap`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ id: userId })
        });
        const data = await res.json();
        if (data.balance !== undefined) {
            userState.balance = data.balance;
            userState.energy = data.energy;
            updateUI();
        }
    } catch (e) { console.error("Tap error", e); }
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
            tg.showAlert("Прорыв системы! +1000 $WBC зачислено.");
            init();
        }
    });
}

function buyRank3() {
    const tonUri = `ton://transfer/${CONFIG.MY_TON_WALLET}?amount=${0.5 * 1e9}&text=upgrade_rank3_${userId}`;
    tg.openLink(tonUri);
    tg.showPopup({ title: 'TON Request', message: 'Оплатите 0.5 TON. Ранг активируется после подтверждения в сети.', buttons: [{type:'ok'}] });
}

function updateUI() {
    document.getElementById('balance-val').innerText = userState.balance.toLocaleString();
    document.getElementById('energy-fill').style.width = userState.energy + "%";
    
    const rankData = CONFIG.RANKS[userState.rank_id];
    const catImg = document.getElementById('cat-img');
    const bg = document.getElementById('bg-layer');

    if (catImg.src !== rankData.img) {
        catImg.src = rankData.img;
        bg.style.backgroundImage = `url(${rankData.img})`;
    }
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
}

init();
setInterval(init, 30000); // Реген раз в 30 сек
