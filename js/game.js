const tg = window.Telegram?.WebApp || null;

let currentLang = "RU";

let userState = {
  balance: 0,
  energy: 100,
  rank_id: 1,
  rank_expires_at: 0,
  zeroDayKeys: 0,
  walletConnected: false,
  withdrawStatus: "none",
  lastWithdraw: null,
  ton_balance: 0
};

let tapQueue = 0;
let tapWorkerRunning = false;
let tapAnimLocked = false;
let tapFlushTimer = null;

let localEnergyTicker = null;
let lastServerSyncTs = Date.now();
let lastServerEnergy = 100;

let adFlowLocked = false;
let tonBuyLocked = false;
let starsBuyLocked = false;

let tonConnectUI = null;
let tonWalletState = null;
let tonStatusUnsubscribe = null;

const TON_CONNECT_MANIFEST_URL = "https://vityacorn26-sys.github.io/wallbreaker/tonconnect-manifest.json";
const TON_CONNECT_BUTTON_ROOT_ID = "ton-connect-root-hidden";

const MAX_ENERGY = 100;

const withdrawWalletInput = document.getElementById("withdraw-wallet-input");
const withdrawAmountInput = document.getElementById("withdraw-amount-input");
const withdrawBtn = document.getElementById("withdraw-btn");
const withdrawMessage = document.getElementById("withdraw-message");

const rankBuyPrimaryBtn = document.getElementById("rank-buy-primary-btn");
const rankBuySecondaryBtn = document.getElementById("rank-buy-secondary-btn");

if (tg) {
  try {
    tg.expand();
    tg.ready();
  } catch (e) {
    console.warn("Telegram WebApp init warning:", e);
  }
}

function getConfig() {
  return window.CONFIG || {};
}

function getGameConfig() {
  return getConfig().GAME || {};
}

function getMenuConfig() {
  return currentLang === "RU"
    ? getConfig().MENU_RU || {}
    : getConfig().MENU || {};
}

function getRanksConfig() {
  return getConfig().RANKS || {};
}

function getCurrency() {
  return getGameConfig().CURRENCY || "$WBC";
}

function getEnergyLabel() {
  return getGameConfig().ENERGY_LABEL || "CPU";
}

function getEnergyRegenSeconds() {
  return Number(getGameConfig().ENERGY_REGEN_SECONDS || 30);
}

function getReferralPercent() {
  return Number(getGameConfig().REFERRAL_PERCENT || 10);
}

function getZeroDayKeyPrice() {
  return Number(getGameConfig().ZERO_DAY_KEY_PRICE || 2000000);
}

function getRankDurationDays() {
  return Number(getGameConfig().RANK_DURATION_DAYS || 7);
}

function getRankById(rankId) {
  const ranks = getRanksConfig();
  return ranks[String(rankId)] || ranks[rankId] || ranks["1"] || ranks[1] || null;
}

function formatDurationLeft(expiresAt) {
  const leftMs = Number(expiresAt || 0) - Date.now();

  if (leftMs <= 0) return null;

  const totalHours = Math.floor(leftMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (currentLang === "RU") {
    if (days > 0) return `${days}д ${hours}ч`;
    return `${Math.max(totalHours, 0)}ч`;
  }

  if (days > 0) return `${days}d ${hours}h`;
  return `${Math.max(totalHours, 0)}h`;
}

function formatWallet(addr) {
  if (!addr) return "";
  if (addr.length <= 20) return addr;

  return addr.slice(0, 6) + "..." + addr.slice(-6);
}

const MANUAL_WITHDRAW_WALLET_KEY = "wb_manual_withdraw_wallet";

function getManualWithdrawWallet() {
  try {
    return localStorage.getItem(MANUAL_WITHDRAW_WALLET_KEY) || "";
  } catch (_) {
    return "";
  }
}

function setManualWithdrawWallet(value) {
  try {
    const clean = String(value || "").trim();
    if (clean) {
      localStorage.setItem(MANUAL_WITHDRAW_WALLET_KEY, clean);
    } else {
      localStorage.removeItem(MANUAL_WITHDRAW_WALLET_KEY);
    }
  } catch (_) {}
}

function getRankPriceLabel(rank) {
  if (!rank) return "";

  const parts = [];

  if (rank.priceWBC > 0) {
    parts.push(`${Number(rank.priceWBC).toLocaleString()} ${getCurrency()}`);
  }

  if (rank.priceTON > 0) {
    parts.push(`${rank.priceTON} TON`);
  }

  if (Number(rank.priceStars || 0) > 0) {
    parts.push(`${Number(rank.priceStars).toLocaleString()} XTR`);
  }

  return parts.join(" / ");
}

const I18N = {
  RU: {
    adLimit: "Лимит рекламы достигнут",
    adNotLoaded: "Monetag SDK не загрузился. Перезапусти бота.",
    adOpenFail: "Реклама сейчас не открылась. Попробуй ещё раз.",
    adRewardOk: "Награда получена",
    adRewardFail: "Ошибка начисления награды",
    adWatchFail: "Реклама не была досмотрена",
    adBusy: "Реклама уже загружается. Подожди несколько секунд.",
    adLoading: "ЗАГРУЗКА РЕКЛАМЫ...",
    userLoadFail: "Ошибка загрузки профиля",
    initDataFail: "Telegram initData не найден",
    refsText: (link) =>
      `Referral Node:\n${link}\n\nLevel 1: 10% from invited users' ad rewards\nLevel 2: 5% from sub-referrals' ad rewards\nLevel 3: 3% from 3rd-level referrals' ad rewards`,
    leaderboardSoon: "Breach Board уже на линии, но панель ещё собирается.",
    fatalError: "Ошибка запуска",
    adCooldownHint: "Если реклама не стартовала, попробуй ещё раз через пару секунд.",
    accountTitle: "АККАУНТ",
    marketTitle: "ДАРКНЕТ-МАРКЕТ",
    prizeTitle: "ПРИЗОВОЙ ПУЛ",
    rankDetailsTitle: "ДЕТАЛИ РАНГА",
    currentRank: "Текущий ранг",
    tapPower: "Сила тапа",
    zeroDayKeys: "Zero-Day Keys",
    prizePool: "Призовой пул",
    walletStatus: "Подключённый кошелёк",
    withdrawStatus: "Статус вывода",
    notConnected: "Не подключён",
    noWithdraws: "Запросов на вывод нет",
    poolLive: "Пул заряжается в сети",
    poolCharging: "HACKER PRIZE POOL IS CHARGING IN THE NETWORK",
    poolLocked: "HACKER PRIZE POOL IS LOCKED — READY FOR DROP",
    drawCompleted: "HACKER PRIZE POOL DROP COMPLETED",
    zeroKeyBuyOk: "Zero-Day Key куплен",
    zeroKeyEnterOk: "Ключ внесён в draw",
    zeroKeyNoKeys: "У тебя пока нет Zero-Day Key",
    zeroKeyNoWbc: "Недостаточно $WBC для покупки Zero-Day Key",
    zeroKeyLimit: "Лимит: максимум 2 ключа на один draw",
    zeroKeyDrawLocked: "Текущий draw уже заблокирован. Ключ не потерян.",
    zeroKeyBuyFail: "Не удалось купить Zero-Day Key",
    zeroKeyEnterFail: "Не удалось внести ключ в draw",
    zeroKeyStatusOpen: "ВНЕСЕНИЕ В DRAW ОТКРЫТО",
    zeroKeyStatusLimit: "ЛИМИТ DRAW ДОСТИГНУТ",
    zeroKeyStatusLocked: "DRAW ЗАБЛОКИРОВАН — ГОТОВ К DROP",
    zeroKeyStatusNoKeys: "У ТЕБЯ НЕТ ZERO-DAY KEY",
    rankDuration: (days) => `Срок действия: ${days} дней`,
    acquireRank: "КУПИТЬ ЗА $WBC",
    activateTon: "КУПИТЬ ЗА TON",
    activateStars: "КУПИТЬ ЗА STARS",
    details: "ПОДРОБНЕЕ",
    zeroDayPersist: "Сохраняется до розыгрыша. Максимум 2 ключа на один draw.",
    rankLabel: (id) => `R${id}`,
    tapOutput: "Сила тапа",
    activationPrice: "Цена активации",
    durationLabel: "Срок действия",
    activeLeft: (time) => `Активен: ${time}`,
    rankBuyOk: "Ранг активирован",
    rankBuyFail: "Покупка ранга не удалась",
    notEnoughTon: "Недостаточно TON",
    notEnoughWbc: "Недостаточно $WBC",
    tonCreateFail: "Не удалось создать TON-платёж",
    tonConfirmFail: "Не удалось подтвердить TON-платёж",
    tonNoProof: "TON proof не получен",
    tonRankActivated: "Ранг успешно активирован",
    tonWalletSdkMissing: "TON Connect SDK не загружен",
    tonWalletInitFail: "TON Connect не инициализировался",
    tonWalletConnectPrompt: "Подключи TON-кошелёк для оплаты ранга",
    tonWalletConnectFailed: "Кошелёк не подключён",
    tonWalletSending: "Открываем TON-кошелёк...",
    tonWalletRejected: "Платёж отклонён в кошельке",
    tonWalletUnavailable: "TON Connect пока не готов. Проверь manifest и перезапусти бота.",
    tonPaymentReady: (amount) => `Платёж подготовлен: ${amount} TON`,
    tonPaymentPendingVerify: "Платёж отправлен. Подтверждаем ранг...",
    tonBuyBusy: "TON-покупка уже выполняется. Подожди пару секунд.",
    starsCreateFail: "Не удалось создать Stars-платёж",
    starsOpenFail: "Не удалось открыть Stars-инвойс",
    starsCancelled: "Оплата Stars отменена",
    starsPending: "Проверяем оплату Stars...",
    starsTimeout: "Платёж ещё не подтверждён. Проверь позже.",
    starsRankActivated: "Ранг успешно активирован через Stars",
    starsBuyBusy: "Покупка через Stars уже выполняется. Подожди пару секунд."
  },
  EN: {
    adLimit: "Ad limit reached",
    adNotLoaded: "Monetag SDK not loaded. Restart the bot.",
    adOpenFail: "Ad failed to open. Please try again.",
    adRewardOk: "Reward received",
    adRewardFail: "Reward credit error",
    adWatchFail: "Ad was not fully watched",
    adBusy: "Ad is already loading. Please wait a few seconds.",
    adLoading: "LOADING AD...",
    userLoadFail: "User loading error",
    initDataFail: "Telegram initData not found",
    refsText: (link) =>
      `Referral Node:\n${link}\n\nLevel 1: 10% from invited users' ad rewards\nLevel 2: 5% from sub-referrals' ad rewards\nLevel 3: 3% from 3rd-level referrals' ad rewards`,
    leaderboardSoon: "Breach Board is online, but the full panel is still being assembled.",
    fatalError: "Launch error",
    adCooldownHint: "If the ad did not start, try again in a few seconds.",
    accountTitle: "ACCOUNT",
    marketTitle: "DARKNET MARKET",
    prizeTitle: "PRIZE POOL",
    rankDetailsTitle: "RANK DETAILS",
    currentRank: "Current Rank",
    tapPower: "Tap Power",
    zeroDayKeys: "Zero-Day Keys",
    prizePool: "Prize Pool",
    walletStatus: "Connected Wallet",
    withdrawStatus: "Withdraw Status",
    notConnected: "Not connected",
    noWithdraws: "No withdraw requests",
    poolCharging: "HACKER PRIZE POOL IS CHARGING IN THE NETWORK",
    poolLocked: "HACKER PRIZE POOL IS LOCKED — READY FOR DROP",
    drawCompleted: "HACKER PRIZE POOL DROP COMPLETED",
    zeroKeyBuyOk: "Zero-Day Key purchased",
    zeroKeyEnterOk: "Key entered into draw",
    zeroKeyNoKeys: "You do not have any Zero-Day Keys yet",
    zeroKeyNoWbc: "Not enough $WBC to buy Zero-Day Key",
    zeroKeyLimit: "Limit: maximum 2 keys per draw",
    zeroKeyDrawLocked: "Current draw is locked. Your key is not lost.",
    zeroKeyBuyFail: "Failed to buy Zero-Day Key",
    zeroKeyEnterFail: "Failed to enter key into draw",
    zeroKeyStatusOpen: "DRAW ENTRY OPEN",
    zeroKeyStatusLimit: "DRAW ENTRY LIMIT REACHED",
    zeroKeyStatusLocked: "DRAW LOCKED — READY FOR DROP",
    zeroKeyStatusNoKeys: "NO ZERO-DAY KEYS AVAILABLE",
    poolLive: "Pool is charging in the network",
    rankDuration: (days) => `Duration: ${days} days`,
    acquireRank: "BUY FOR $WBC",
    activateTon: "BUY FOR TON",
    activateStars: "BUY FOR STARS",
    details: "DETAILS",
    zeroDayPersist: "Persists until draw. Maximum 2 keys per draw.",
    rankLabel: (id) => `R${id}`,
    tapOutput: "Tap Output",
    activationPrice: "Activation Price",
    durationLabel: "Duration",
    activeLeft: (time) => `Active: ${time}`,
    rankBuyOk: "Rank activated",
    rankBuyFail: "Rank purchase failed",
    notEnoughTon: "Not enough TON",
    notEnoughWbc: "Not enough $WBC",
    tonCreateFail: "Failed to create TON payment",
    tonConfirmFail: "Failed to confirm TON payment",
    tonNoProof: "No TON proof received",
    tonRankActivated: "Rank activated successfully",
    tonWalletSdkMissing: "TON Connect SDK not loaded",
    tonWalletInitFail: "TON Connect failed to initialize",
    tonWalletConnectPrompt: "Connect a TON wallet to pay for the rank",
    tonWalletConnectFailed: "Wallet is not connected",
    tonWalletSending: "Opening TON wallet...",
    tonWalletRejected: "Payment was rejected in the wallet",
    tonWalletUnavailable: "TON Connect is not ready yet. Check the manifest and restart the bot.",
    tonPaymentReady: (amount) => `Payment prepared: ${amount} TON`,
    tonPaymentPendingVerify: "Payment sent. Confirming rank...",
    tonBuyBusy: "TON purchase is already in progress. Please wait a few seconds.",
    starsCreateFail: "Failed to create Stars payment",
    starsOpenFail: "Failed to open Stars invoice",
    starsCancelled: "Stars payment was cancelled",
    starsPending: "Checking Stars payment...",
    starsTimeout: "Payment is not confirmed yet. Check again later.",
    starsRankActivated: "Rank activated successfully via Stars",
    starsBuyBusy: "Stars purchase is already in progress. Please wait a few seconds."
  }
};

function t() {
  return I18N[currentLang] || I18N.RU;
}

function notifyTitleByType(type) {
  if (currentLang === "RU") {
    if (type === "success") return "✅ ДОСТУП РАЗРЕШЁН";
    if (type === "error") return "⛔ ДОСТУП ОТКЛОНЁН";
    if (type === "warning") return "⚠ СИСТЕМНОЕ ПРЕДУПРЕЖДЕНИЕ";
    return "ℹ СИСТЕМНОЕ СООБЩЕНИЕ";
  }

  if (type === "success") return "✅ ACCESS GRANTED";
  if (type === "error") return "⛔ ACCESS DENIED";
  if (type === "warning") return "⚠ SYSTEM ALERT";
  return "ℹ SYSTEM MESSAGE";
}

function showNotify(type, message, ttl = 3000) {
  const root = document.getElementById("wb-notify-root");
  if (!root) {
    if (tg?.showAlert) tg.showAlert(String(message));
    else alert(String(message));
    return;
  }

  const item = document.createElement("div");
  item.className = `wb-notify wb-notify-${type || "info"}`;

  const title = document.createElement("div");
  title.className = "wb-notify-title";
  title.textContent = notifyTitleByType(type || "info");

  const text = document.createElement("div");
  text.className = "wb-notify-text";
  text.textContent = String(message || "");

  item.appendChild(title);
  item.appendChild(text);
  root.appendChild(item);

  const close = () => {
    if (!item.parentNode) return;
    item.classList.add("hide");
    setTimeout(() => item.remove(), 180);
  };

  setTimeout(close, ttl);

  item.addEventListener("click", close);
}

function safeAlert(message) {
  showNotify("info", String(message || ""));
}

function mapPromoErrorMessage(errorCode) {
  const code = String(errorCode || "").trim();

  if (currentLang === "RU") {
    if (code === "promo_not_found") return "Код не найден в сети.";
    if (code === "promo_expired") return "Срок действия промокода истёк.";
    if (code === "promo_limit_reached") return "Лимит активаций исчерпан.";
    if (code === "promo_already_claimed") return "Ты уже активировал этот промокод.";
    if (code === "invalid_code") return "Неверный формат промокода.";
    if (code === "promo_redeem_failed") return "Не удалось активировать промокод.";
    return code || "Системная ошибка.";
  }

  if (code === "promo_not_found") return "Code not found in the network.";
  if (code === "promo_expired") return "Promo code has expired.";
  if (code === "promo_limit_reached") return "Promo activation limit reached.";
  if (code === "promo_already_claimed") return "You have already used this promo code.";
  if (code === "invalid_code") return "Invalid promo code format.";
  if (code === "promo_redeem_failed") return "Failed to activate promo code.";
  return code || "System error.";
}

function getAdsButton() {
  return document.getElementById("btn-ads");
}

function setAdsButtonBusy(isBusy) {
  const adsBtn = getAdsButton();
  if (!adsBtn) return;

  if (!adsBtn.dataset.defaultText) {
    adsBtn.dataset.defaultText = adsBtn.textContent || "";
  }

  if (isBusy) {
    adsBtn.disabled = true;
    adsBtn.classList.add("btn-disabled");
    adsBtn.textContent = t().adLoading;
  } else {
    adsBtn.disabled = false;
    adsBtn.classList.remove("btn-disabled");
    adsBtn.textContent = getMenuConfig().codeInjection || "CODE INJECTION (+1500)";
  }
}

function showLoadingScreen() {
  const loadingEl = document.getElementById("loading-screen");
  const gameUiEl = document.getElementById("game-ui");
  const bgLayerEl = document.getElementById("bg-layer");
  const menuBtnEl = document.getElementById("menu-btn");

  if (loadingEl) loadingEl.style.display = "flex";
  if (gameUiEl) gameUiEl.style.display = "none";
  if (bgLayerEl) bgLayerEl.style.display = "none";
  if (menuBtnEl) menuBtnEl.style.display = "none";
}

function showGameScreen() {
  const loadingEl = document.getElementById("loading-screen");
  const gameUiEl = document.getElementById("game-ui");
  const bgLayerEl = document.getElementById("bg-layer");
  const menuBtnEl = document.getElementById("menu-btn");

  if (loadingEl) loadingEl.style.display = "none";
  if (gameUiEl) gameUiEl.style.display = "block";
  if (bgLayerEl) bgLayerEl.style.display = "block";
  if (menuBtnEl) menuBtnEl.style.display = "flex";
}

function showFatalError(message) {
  console.error(message);

  const loadingEl = document.getElementById("loading-screen");
  const gameUiEl = document.getElementById("game-ui");
  const balanceEl = document.getElementById("balance-val");
  const energyTextEl = document.getElementById("energy-text");

  if (loadingEl) loadingEl.style.display = "none";
  if (gameUiEl) gameUiEl.style.display = "block";
  if (balanceEl) balanceEl.innerText = "ERROR";
  if (energyTextEl) energyTextEl.innerText = message;

  safeAlert(message);
}

function normalizeUserState(data) {
  return {
    ...userState,
    ...data,
    balance: Number(data?.balance || 0),
    energy: Math.max(0, Math.min(MAX_ENERGY, Number(data?.energy || 0))),
    rank_id: Number(data?.rank_id || 1),
    rank_expires_at: Number(data?.rank_expires_at || 0),
    zeroDayKeys: Number(data?.zeroDayKeys || data?.zero_day_keys || userState.zeroDayKeys || 0),
    walletConnected: Boolean(data?.walletConnected || data?.wallet_connected || userState.walletConnected || false),
    withdrawStatus: String(data?.withdrawStatus || data?.withdraw_status || userState.withdrawStatus || "none"),
    lastWithdraw: data?.lastWithdraw || data?.last_withdraw || userState.lastWithdraw || null,
    ton_balance: Number(data?.ton_balance || userState.ton_balance || 0)
  };
}

function syncEnergyBase() {
  lastServerEnergy = Math.max(0, Math.min(MAX_ENERGY, Number(userState.energy || 0)));
  lastServerSyncTs = Date.now();
}

function getRenderedEnergy() {
  const elapsedMs = Date.now() - lastServerSyncTs;
  const gained = Math.floor(elapsedMs / (getEnergyRegenSeconds() * 1000));
  return Math.max(0, Math.min(MAX_ENERGY, lastServerEnergy + gained));
}

function updatePrizePoolPanel(statusData = null) {
  const prizePoolLive = document.getElementById("prize-pool-live-value");
  const accountPrizePool = document.getElementById("account-prize-pool-value");

  const poolState = String(statusData?.pool_state || "").trim().toLowerCase();

  let poolText = t().poolCharging;

  if (poolState === "locked_ready_for_drop") {
    poolText = t().poolLocked;
  } else if (poolState === "completed") {
    poolText = t().drawCompleted;
  } else if (poolState === "charging") {
    poolText = t().poolCharging;
  }

  if (prizePoolLive) prizePoolLive.textContent = poolText;
  if (accountPrizePool) accountPrizePool.textContent = poolText;
}

async function refreshDrawStatusGlobal() {
  try {
    const status = await API.getDrawStatus();

    if (status?.success) {
      userState.zeroDayKeys = Number(status.keys || userState.zeroDayKeys || 0);
      updateAccountPanel();
      updatePrizePoolPanel(status);
      return status;
    }

    updatePrizePoolPanel();
    return null;
  } catch (e) {
    console.error("refreshDrawStatusGlobal error:", e);
    updatePrizePoolPanel();
    return null;
  }
}

function getTonWalletShort() {
  const addr = tonWalletState?.account?.address || "";
  if (!addr) return "";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

function updateAccountPanel() {
  const rank = getRankById(userState.rank_id);

  const rankValue = document.getElementById("account-rank-value");
  const tapValue = document.getElementById("account-tap-value");
  const keysValue = document.getElementById("account-keys-value");
  const tonBalanceValue = document.getElementById("account-ton-balance-value");
  const walletStatus = document.getElementById("account-wallet-status");
  const withdrawStatus = document.getElementById("account-withdraw-status");

  if (rankValue) {
    const left = formatDurationLeft(userState.rank_expires_at);
    rankValue.textContent = left && userState.rank_id > 1
      ? `${rank?.name || "Proxy Hacker"} • ${left}`
      : (rank?.name || "Proxy Hacker");
  }

  if (tapValue) tapValue.textContent = `${Number(rank?.mult || 10).toLocaleString()} ${getCurrency()} / tap`;
  if (keysValue) keysValue.textContent = Number(userState.zeroDayKeys || 0).toLocaleString();
  if (tonBalanceValue) {
  tonBalanceValue.textContent = `${Number(userState.ton_balance || 0).toFixed(2)} TON`;
  }
  
  const enteredWallet = withdrawWalletInput?.value?.trim() || "";
  const sessionWallet = userState.lastWithdraw?.wallet || "";
  const connectedTonWallet = getTonWalletShort();
  const connectedTonWalletFull = getTonWalletAddress();
  const manualWallet = getManualWithdrawWallet();
  const preferredWallet = enteredWallet || manualWallet || connectedTonWalletFull || sessionWallet || "";

  if (walletStatus) {
    if (preferredWallet) {
      walletStatus.textContent = formatWallet(preferredWallet);
    } else {
      walletStatus.textContent = t().notConnected;
    }
  }

  if (
    withdrawWalletInput &&
    preferredWallet &&
    !withdrawWalletInput.dataset.walletAutofilled &&
    !withdrawWalletInput.matches(":focus") &&
    !withdrawWalletInput.value.trim()
  ) {
    withdrawWalletInput.value = preferredWallet;
    withdrawWalletInput.dataset.walletAutofilled = "1";
  }

  if (withdrawStatus) {
    if (userState.lastWithdraw) {
      const amount = Number(userState.lastWithdraw.amount || 0);
      const currency = userState.lastWithdraw.currency || "TON";
      const status = userState.lastWithdraw.status || userState.withdrawStatus || "pending";
      withdrawStatus.textContent = `${status} • ${amount} ${currency}`;
    } else {
      withdrawStatus.textContent = t().noWithdraws;
    }
  }

  const cards = document.querySelectorAll("#account-panel-overlay .account-card");
  if (cards[0]) cards[0].querySelector("strong").textContent = t().currentRank;
  if (cards[1]) cards[1].querySelector("strong").textContent = t().tapPower;
  if (cards[2]) cards[2].querySelector("strong").textContent = t().zeroDayKeys;
  if (cards[3]) cards[3].querySelector("strong").textContent = t().prizePool;
  if (cards[4]) cards[4].querySelector("strong").textContent = t().tonBalance || "TON Balance";
  if (cards[5]) cards[5].querySelector("strong").textContent = t().walletStatus;
  if (cards[6]) cards[6].querySelector("strong").textContent = t().withdrawStatus;
}

function updateUI() {
  const balanceEl = document.getElementById("balance-val");
  const balanceCurrencyEl = document.getElementById("balance-currency");
  const energyFillEl = document.getElementById("energy-fill");
  const energyTextEl = document.getElementById("energy-text");
  const energyValueEl = document.getElementById("energy-value");
  const catImgEl = document.getElementById("cat-img");
  const bgLayerEl = document.getElementById("bg-layer");

  const safeBalance = Number(userState.balance || 0);
  const safeEnergy = getRenderedEnergy();
  const rank = getRankById(userState.rank_id);
  const img = rank?.img || "assets/cat1.jpg";

  if (balanceEl) balanceEl.innerText = safeBalance.toLocaleString();
  if (balanceCurrencyEl) balanceCurrencyEl.innerText = getCurrency();

  if (energyFillEl) energyFillEl.style.width = `${safeEnergy}%`;
  if (energyTextEl) energyTextEl.innerText = `${getEnergyLabel()}: ${safeEnergy}`;
  if (energyValueEl) energyValueEl.innerText = `${safeEnergy} / ${MAX_ENERGY}`;

  if (catImgEl && catImgEl.getAttribute("src") !== img) {
    catImgEl.src = img;
  }

  if (bgLayerEl) {
    const nextBg = `url(${img})`;
    if (bgLayerEl.style.backgroundImage !== nextBg) {
      bgLayerEl.style.backgroundImage = nextBg;
    }
  }

  updateAccountPanel();
  updatePrizePoolPanel();
  updateRankLabel();
  renderMarketPanel();
}

function applyTexts() {
  const menu = getMenuConfig();

  const refs = document.getElementById("btn-refs");
  const top = document.getElementById("btn-top");
  const market = document.getElementById("btn-market");
  const close = document.getElementById("btn-close");
  const ads = document.getElementById("btn-ads");
  const account = document.getElementById("btn-account");
  const protocol = document.getElementById("btn-protocol");
  const tasks = document.getElementById("btn-tasks");
  const promo = document.getElementById("btn-promo");
  const balanceCurrencyEl = document.getElementById("balance-currency");

  if (refs) refs.textContent = menu.referralNode || "REFERRAL NODE";
  if (top) top.textContent = menu.breachBoard || "BREACH BOARD";
  if (market) market.textContent = menu.darknetMarket || "DARKNET MARKET";
  if (protocol) protocol.textContent = menu.missionProtocol || "MISSION PROTOCOL";
  if (close) close.textContent = menu.close || "CLOSE";
  if (ads) {
    ads.textContent = adFlowLocked
      ? t().adLoading
      : (menu.codeInjection || "CODE INJECTION (+1500)");
  }
  if (account) account.textContent = menu.account || "ACCOUNT";
  if (tasks) tasks.textContent = getTasksPromoText().tasksBtn;
  if (promo) promo.textContent = getTasksPromoText().promoBtn;
  syncTasksPromoTexts();
  if (balanceCurrencyEl) balanceCurrencyEl.textContent = getCurrency();

  const ru = document.getElementById("lang-ru");
  const en = document.getElementById("lang-en");

  if (ru) ru.classList.toggle("active-lang", currentLang === "RU");
  if (en) en.classList.toggle("active-lang", currentLang === "EN");

  const marketTitle = document.getElementById("market-panel-title");
  const accountTitle = document.getElementById("account-panel-title");
  const prizeTitle = document.getElementById("prize-panel-title");
  const rankDetailsTitle = document.getElementById("rank-details-title");

  if (marketTitle) marketTitle.textContent = t().marketTitle;
  if (accountTitle) accountTitle.textContent = t().accountTitle;
  if (prizeTitle) prizeTitle.textContent = t().prizeTitle;
  if (rankDetailsTitle) rankDetailsTitle.textContent = t().rankDetailsTitle;

  renderMarketPanel();
  updateAccountPanel();
  updatePrizePoolPanel();
  updateUI();

  const protocolOverlay = document.getElementById("protocol-panel-overlay");
  if (protocolOverlay && !protocolOverlay.classList.contains("hidden")) {
    renderProtocolPanel();
  }
}

window.setLang = (lang) => {
  currentLang = lang === "EN" ? "EN" : "RU";
  applyTexts();
};

function ensureTonConnectMount() {
  let mount = document.getElementById(TON_CONNECT_BUTTON_ROOT_ID);
  if (mount) return mount;

  mount = document.createElement("div");
  mount.id = TON_CONNECT_BUTTON_ROOT_ID;
  mount.style.position = "fixed";
  mount.style.left = "-9999px";
  mount.style.top = "-9999px";
  mount.style.width = "1px";
  mount.style.height = "1px";
  mount.style.opacity = "0";
  mount.style.pointerEvents = "none";
  document.body.appendChild(mount);
  return mount;
}

function initTonConnect() {
  if (tonConnectUI) return tonConnectUI;

  if (!window.TON_CONNECT_UI || !window.TON_CONNECT_UI.TonConnectUI) {
    console.error("TON Connect global is missing");
    return null;
  }

  ensureTonConnectMount();

  try {
        tonConnectUI = new window.TON_CONNECT_UI.TonConnectUI({
      manifestUrl: TON_CONNECT_MANIFEST_URL,
      buttonRootId: TON_CONNECT_BUTTON_ROOT_ID,
      actionsConfiguration: {
        twaReturnUrl: window.location.href
      }
    });

    tonConnectUI.uiOptions = {
      language: currentLang === "RU" ? "ru" : "en"
    };

    if (typeof tonStatusUnsubscribe === "function") {
      tonStatusUnsubscribe();
    }

    tonStatusUnsubscribe = tonConnectUI.onStatusChange((wallet) => {
      tonWalletState = wallet || null;
      updateAccountPanel();
    });

    tonWalletState = tonConnectUI.wallet || tonConnectUI.account || null;
    return tonConnectUI;
  } catch (e) {
    console.error("TON Connect init error:", e);
    return null;
  }
}

function getTonWalletAddress() {
  const accountAddress =
    tonWalletState?.account?.address ||
    tonConnectUI?.account?.address ||
    "";

  return String(accountAddress || "").trim();
}

function toNanoString(amountTon) {
  const normalized = String(amountTon).trim();
  if (!normalized) return "0";

  const [wholeRaw, fracRaw = ""] = normalized.split(".");
  const whole = wholeRaw.replace(/\D/g, "") || "0";
  const frac = fracRaw.replace(/\D/g, "").slice(0, 9).padEnd(9, "0");

  const combined = `${whole}${frac}`.replace(/^0+(?=\d)/, "");
  return combined || "0";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTonWalletConnection(timeoutMs = 60000) {
  const existing = getTonWalletAddress();
  if (existing) return existing;

  return new Promise((resolve) => {
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      if (typeof unsubscribe === "function") unsubscribe();
      resolve("");
    }, timeoutMs);

    const unsubscribe = tonConnectUI.onStatusChange((wallet) => {
      const address = wallet?.account?.address || "";
      if (!address || finished) return;

      finished = true;
      clearTimeout(timer);
      unsubscribe();
      tonWalletState = wallet;
      resolve(String(address));
    });
  });
}

async function ensureTonWalletConnected() {
  const ui = initTonConnect();
  if (!ui) {
    safeAlert(t().tonWalletUnavailable);
    return false;
  }

  if (getTonWalletAddress()) {
    return true;
  }

  try {
    await ui.openModal();
  } catch (e) {
    console.error("TON Connect openModal error:", e);
  }

  const connectedAddress = await waitForTonWalletConnection(25000);
  if (!connectedAddress) {
    return false;
  }

  updateAccountPanel();
  return true;
}

async function loadUser() {
  try {
    showLoadingScreen();

    if (!tg?.initData) {
      showFatalError(t().initDataFail);
      return;
    }

    initTonConnect();

    const data = await API.getUser();

    if (!data) {
      showFatalError(t().userLoadFail);
      return;
    }

    userState = normalizeUserState(data);
    tapQueue = 0;
    syncEnergyBase();

    await loadWithdrawStatus();
    await refreshDrawStatusGlobal();

    applyTexts();
    startLocalEnergyTicker();
    showGameScreen();
  } catch (e) {
    console.error("Load user error:", e);
    showFatalError(t().userLoadFail);
  }
}

async function loadWithdrawStatus() {
  try {
    const result = await API.getWithdrawStatus();

    if (result?.success) {
      userState.lastWithdraw = result.request || null;
      userState.withdrawStatus = result.request?.status || "none";
      userState.walletConnected = Boolean(result.request?.wallet);
    } else {
      userState.lastWithdraw = null;
      userState.withdrawStatus = "none";
    }

    updateAccountPanel();
  } catch (e) {
    console.error("loadWithdrawStatus error:", e);
  }
}

async function handleWithdrawRequest() {
  try {
    const wallet = (withdrawWalletInput?.value || "").trim();
    const amount = Number(withdrawAmountInput?.value || 0);

    if (withdrawMessage) withdrawMessage.textContent = "";

    if (!wallet) {
      if (withdrawMessage) withdrawMessage.textContent = "Enter TON wallet first";
      return;
    }

    if (!amount || amount < 2.5) {
      if (withdrawMessage) withdrawMessage.textContent = "Minimum withdraw is 2.5 TON";
      return;
    }

    if (withdrawBtn) {
      withdrawBtn.disabled = true;
      withdrawBtn.textContent = "PROCESSING...";
    }

    const result = await API.requestWithdraw(amount, wallet);

    if (!result?.success) {
      const errorCode = result?.error || "withdraw_failed";

      if (errorCode === "pending_exists") {
        if (withdrawMessage) withdrawMessage.textContent = "You already have a pending withdraw request";
      } else if (errorCode === "invalid_wallet") {
        if (withdrawMessage) withdrawMessage.textContent = "Invalid TON wallet address";
      } else if (errorCode === "insufficient_balance") {
        if (withdrawMessage) withdrawMessage.textContent = "Insufficient TON balance";
      } else if (errorCode === "min_amount") {
        if (withdrawMessage) withdrawMessage.textContent = "Minimum withdraw is 2.5 TON";
      } else {
        if (withdrawMessage) withdrawMessage.textContent = "Withdraw request failed";
      }

      return;
    }

    userState.ton_balance = Number(result.ton_balance || userState.ton_balance || 0);
    userState.lastWithdraw = {
      amount: result.amount,
      wallet: result.wallet,
      currency: result.currency || "TON",
      status: "pending"
    };
    userState.withdrawStatus = "pending";
    userState.walletConnected = true;

    if (withdrawMessage) withdrawMessage.textContent = "Withdraw request created";
    updateAccountPanel();
  } catch (e) {
    console.error("handleWithdrawRequest error:", e);
    if (withdrawMessage) withdrawMessage.textContent = "Withdraw request failed";
  } finally {
    if (withdrawBtn) {
      withdrawBtn.disabled = false;
      withdrawBtn.textContent = "REQUEST WITHDRAW";
    }
  }
}

async function handleRankPurchase(rankId, currency) {
  const rank = getRankById(rankId);
  if (!rank || rank.id <= 1) return;

  const normalizedCurrency = String(currency || "").toUpperCase();

  if (normalizedCurrency === "TON") {
    await buyRankForTon(rank.id);
    return;
  }

  if (normalizedCurrency === "XTR" || normalizedCurrency === "STARS") {
    await buyRankForStars(rank.id);
    return;
  }

  const result = await API.buyRank(rank.id, normalizedCurrency);

  if (!result?.success) {
    const errorCode = result?.error || "rank_buy_failed";

    if (String(errorCode).toUpperCase().includes("TON")) {
      safeAlert(t().notEnoughTon);
    } else if (String(errorCode).toUpperCase().includes("WBC")) {
      safeAlert(t().notEnoughWbc);
    } else {
      safeAlert(t().rankBuyFail);
    }
    return;
  }

  userState = normalizeUserState({
    ...userState,
    rank_id: result.rank_id,
    rank_expires_at: result.rank_expires_at,
    balance: result.balance,
    wbc_balance: result.wbc_balance,
    ton_balance: result.ton_balance
  });

  syncEnergyBase();
  updateUI();
  closeAllPanels();
  safeAlert(t().rankBuyOk);
}

async function buyRankForTon(rankId) {
  if (tonBuyLocked) {
    safeAlert(t().tonBuyBusy);
    return;
  }

  tonBuyLocked = true;

  try {
    const connected = await ensureTonWalletConnected();
    if (!connected) {
      return;
    }

    const create = await API.createTonPurchase(rankId);

    if (!create?.success) {
      safeAlert(create?.error || t().tonCreateFail);
      return;
    }

    const payload = String(create.payload || "").trim();
    const tx = create.tx || null;

    if (!payload || !tx || !Array.isArray(tx.messages) || !tx.messages.length) {
      safeAlert(t().tonCreateFail);
      return;
    }

    const ui = initTonConnect();
    if (!ui) {
      safeAlert(t().tonWalletInitFail);
      return;
    }

    let txResult = null;

    try {
      txResult = await ui.sendTransaction(tx);
    } catch (e) {
      console.error("TON sendTransaction error:", e);
      safeAlert("TON sendTransaction error: " + String(e?.message || e || "unknown_error"));
      return;
    }

    const proof = String(
      txResult?.boc ||
      txResult?.result ||
      txResult?.transaction?.boc ||
      ""
    ).trim();

    if (!proof) {
      safeAlert(t().tonNoProof);
      return;
    }

    const confirm = await API.confirmTonPurchase(rankId, payload, proof);

    if (!confirm?.success) {
      safeAlert(confirm?.error || t().tonConfirmFail);
      return;
    }

    userState = normalizeUserState({
      ...userState,
      rank_id: confirm.rank_id,
      rank_expires_at: confirm.rank_expires_at,
      balance: confirm.balance,
      wbc_balance: confirm.wbc_balance,
      ton_balance: confirm.ton_balance
    });

    syncEnergyBase();
    updateUI();
    closeAllPanels();
    safeAlert(t().tonRankActivated);
  } catch (e) {
    console.error("buyRankForTon error:", e);
    safeAlert("buyRankForTon error: " + String(e?.message || e || "unknown_error"));
  } finally {
    tonBuyLocked = false;
  }
}

async function waitForStarsConfirmation(payload, maxAttempts = 12, delayMs = 2000) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const statusResp = await API.getStarsPurchaseStatus(payload);

    if (statusResp?.success && statusResp?.payment?.status === "paid") {
      return statusResp;
    }

    await sleep(delayMs);
  }

  return null;
}

async function openTelegramInvoice(invoiceLink) {
  if (!tg || typeof tg.openInvoice !== "function") {
    throw new Error("telegram_open_invoice_unavailable");
  }

  return new Promise((resolve, reject) => {
    try {
      tg.openInvoice(invoiceLink, (status) => {
        resolve(String(status || ""));
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function buyRankForStars(rankId) {
  if (starsBuyLocked) {
    safeAlert(t().starsBuyBusy);
    return;
  }

  starsBuyLocked = true;

  try {
    const create = await API.createStarsPurchase(rankId);

    if (!create?.success) {
      safeAlert(create?.error || t().starsCreateFail);
      return;
    }

    const invoiceLink = String(create.invoice_link || "").trim();
    const payload = String(create.payload || "").trim();

    if (!invoiceLink || !payload) {
      safeAlert(t().starsCreateFail);
      return;
    }

    let invoiceStatus = "";

    try {
      invoiceStatus = await openTelegramInvoice(invoiceLink);
    } catch (e) {
      console.error("openInvoice error:", e);
      safeAlert(t().starsOpenFail);
      return;
    }

    if (invoiceStatus && invoiceStatus !== "paid") {
      safeAlert(t().starsCancelled);
      return;
    }

    safeAlert(t().starsPending);

    const statusResp = await waitForStarsConfirmation(payload);

    if (!statusResp?.success || statusResp?.payment?.status !== "paid") {
      safeAlert(t().starsTimeout);
      return;
    }

    userState = normalizeUserState({
      ...userState,
      ...(statusResp.user || {})
    });

    syncEnergyBase();
    updateUI();
    closeAllPanels();
    safeAlert(t().starsRankActivated);
  } catch (e) {
    console.error("buyRankForStars error:", e);
    safeAlert(t().starsOpenFail);
  } finally {
    starsBuyLocked = false;
  }
}

function startLocalEnergyTicker() {
  if (localEnergyTicker) {
    clearInterval(localEnergyTicker);
  }

  localEnergyTicker = setInterval(() => {
    const renderedEnergy = getRenderedEnergy();

    if (renderedEnergy !== Number(userState.energy || 0)) {
      userState.energy = renderedEnergy;
      updateUI();
    } else {
      renderMarketPanel();
      updateAccountPanel();
    }
  }, 1000);
}

function animateTap() {
  const box = document.getElementById("cat-box");
  if (!box) return;
  if (tapAnimLocked) return;

  tapAnimLocked = true;
  box.style.transform = "scale(0.985)";

  setTimeout(() => {
    box.style.transform = "scale(1)";
    tapAnimLocked = false;
  }, 45);
}

async function refreshUserSilently() {
  try {
    const fresh = await API.getUser();
    if (!fresh) return false;

    userState = normalizeUserState(fresh);
    syncEnergyBase();
    updateUI();
    return true;
  } catch (e) {
    console.error("refreshUserSilently error:", e);
    return false;
  }
}

async function processTapQueue() {
  if (tapWorkerRunning) return;
  tapWorkerRunning = true;

  try {
    while (tapQueue > 0) {
      const data = await API.sendTap();
      tapQueue -= 1;

      if (data && data.balance !== undefined) {
        userState = normalizeUserState({
          ...userState,
          balance: data.balance,
          energy: data.energy,
          rank_id: data.rank_id ?? userState.rank_id,
          rank_expires_at: data.rank_expires_at ?? userState.rank_expires_at,
          ton_balance: data.ton_balance ?? userState.ton_balance
        });

        syncEnergyBase();
        updateUI();
      } else {
        tapQueue = 0;
        await refreshUserSilently();
      }
    }
  } catch (e) {
    console.error("Tap queue error:", e);
    tapQueue = 0;
    await refreshUserSilently();
  } finally {
    tapWorkerRunning = false;
  }
}

window.handleTap = () => {
  const visibleEnergy = getRenderedEnergy();
  if ((visibleEnergy - tapQueue) <= 0) return;

  animateTap();

  tapQueue += 1;
  userState.energy = Math.max(0, visibleEnergy - 1);
  syncEnergyBase();
  updateUI();

  if (tapFlushTimer) clearTimeout(tapFlushTimer);
  tapFlushTimer = setTimeout(() => {
    processTapQueue();
  }, 90);
};

function closeSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.remove("active");
}

window.toggleMenu = () => {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.toggle("active");
};

function closeAllPanels() {
  document.querySelectorAll(".panel-overlay, .modal-overlay").forEach((el) => {
    el.classList.add("hidden");
    el.setAttribute("aria-hidden", "true");
  });
}

function openPanel(overlayId) {
  closeAllPanels();
  const el = document.getElementById(overlayId);
  if (!el) return;
  el.classList.remove("hidden");
  el.setAttribute("aria-hidden", "false");
  closeSidebar();
}

function bindOverlayClosers() {
  document.querySelectorAll(".panel-overlay, .modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        closeAllPanels();
      }
    });
  });
}

window.showRefs = async () => {
  const refCode = String(userState.ref_code || "").trim();

  if (!refCode) {
    safeAlert("Referral link is not ready yet. Please reopen the app.");
    return;
  }

  const link = `https://t.me/BypassWallBot/play?start=${encodeURIComponent(refCode)}`;
  const text = `${t().refsText(link)}\n\n${link}`;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      safeAlert(`${t().refsText(link)}\n\nCopied to clipboard`);
      return;
    }
  } catch (_) {}

  safeAlert(text);
};

window.showLeaderboard = async () => {
  const status = await refreshDrawStatusGlobal();

  let poolText = t().poolCharging;
  if (status?.pool_state === "locked_ready_for_drop") {
    poolText = t().poolLocked;
  } else if (status?.pool_state === "completed") {
    poolText = t().drawCompleted;
  }

  const keys = Number(status?.keys || userState.zeroDayKeys || 0);
  const entered = Number(status?.entered || 0);
  const max = Number(status?.max || 2);

  const text = [
    "BREACH BOARD",
    "",
    poolText,
    "",
    `ZERO-DAY KEYS: ${keys}`,
    `DRAW ENTRY: ${entered} / ${max}`
  ];

  safeAlert(text.join("\n"));
};

function renderMarketPanel() {
  const marketOverlay = document.getElementById("market-panel-overlay");
  if (!marketOverlay) return;

  const rankCards = marketOverlay.querySelectorAll(".rank-card");
  const ranks = [getRankById(2), getRankById(3), getRankById(4), getRankById(5)].filter(Boolean);

  rankCards.forEach((card, index) => {
    const rank = ranks[index];
    if (!rank) return;

    const currentRankId = userState.rank_id;
    const activeBadge = card.querySelector(".rank-active-badge");

    if (activeBadge) {
      if (rank.id === currentRankId) {
        const left = formatDurationLeft(userState.rank_expires_at);
        activeBadge.textContent = left || "ACTIVE";
        activeBadge.classList.remove("hidden");
      } else {
        activeBadge.classList.add("hidden");
      }
    }

    const badgeEl = card.querySelector(".market-rank-badge");
    const iconEl = card.querySelector(".market-rank-icon");
    const pEls = card.querySelectorAll("p");
    const nameStrong = card.querySelector("strong");
    const btn = card.querySelector("button");

    if (badgeEl) {
      badgeEl.textContent = t().rankLabel(rank.id);
      badgeEl.classList.toggle("market-rank-badge-ton", rank.priceTON > 0 || Number(rank.priceStars || 0) > 0);
    }

    if (iconEl) {
      iconEl.src = rank.img;
      iconEl.alt = rank.name;
    }

    if (nameStrong) {
      nameStrong.textContent = rank.name;
    }

    if (pEls[1]) {
      pEls[1].textContent = `${Number(rank.mult).toLocaleString()} ${getCurrency()} / tap`;
    }

    if (pEls[2]) {
      pEls[2].textContent = getRankPriceLabel(rank);
    }

    if (pEls[3]) {
      const left = rank.id === currentRankId ? formatDurationLeft(userState.rank_expires_at) : null;
      pEls[3].textContent = left
        ? t().activeLeft(left)
        : t().rankDuration(getRankDurationDays());
    }

    if (btn) {
      if (rank.id === currentRankId) {
        btn.textContent = "ACTIVE";
        btn.disabled = true;
        btn.onclick = null;
      } else {
        btn.textContent = t().details;
        btn.disabled = false;
        btn.onclick = () => showRankDetails(rank.id);
      }
    }
  });
}

window.showRanks = () => {
  renderMarketPanel();
  openPanel("market-panel-overlay");
};

window.closeRankDetailsPanel = () => {
  renderMarketPanel();
  openPanel("market-panel-overlay");
};

window.showAccount = () => {
  updateAccountPanel();
  openPanel("account-panel-overlay");
};

function getTasksPromoText() {
  if (currentLang === "RU") {
    return {
      tasksBtn: "TASKS",
      promoBtn: "ПРОМОКОД",
      tasksTitle: "TASKS",
      promoTitle: "ПРОМОКОД",
      tasksLoading: "Загрузка задач...",
      tasksLoadFail: "Не удалось загрузить задачи",
      noTasks: "Пока задач нет",
      claim: "ЗАБРАТЬ",
      claimed: "ЗАБРАНО",
      activateCode: "АКТИВАЦИЯ КОДА",
      enterCodeHint: "Введи промокод и забери награду.",
      promoWaiting: "Ожидание кода...",
      promoEmpty: "Введи промокод",
      promoApply: "АКТИВИРОВАТЬ",
      promoSuccessTon: (amount) => `Промокод активирован: +${Number(amount || 0).toFixed(4)} TON`,
      promoSuccessWbc: (amount) => `Промокод активирован: +${Number(amount || 0).toLocaleString()} ${getCurrency()}`,
      promoFail: "Не удалось активировать промокод",
      rewardWbc: (amount) => `Награда: +${Number(amount || 0).toLocaleString()} ${getCurrency()}`,
      rewardKey: (amount) => `Награда: +${Number(amount || 0)} Zero-Day Key`,
      progress: (a, b) => `Прогресс: ${a} / ${b}`
    };
  }

  return {
    tasksBtn: "TASKS",
    promoBtn: "PROMO CODE",
    tasksTitle: "TASKS",
    promoTitle: "PROMO CODE",
    tasksLoading: "Loading tasks...",
    tasksLoadFail: "Failed to load tasks",
    noTasks: "No tasks yet",
    claim: "CLAIM",
    claimed: "CLAIMED",
    activateCode: "ACTIVATE CODE",
    enterCodeHint: "Enter promo code and claim reward.",
    promoWaiting: "Waiting for code...",
    promoEmpty: "Enter promo code",
    promoApply: "ACTIVATE",
    promoSuccessTon: (amount) => `Promo activated: +${Number(amount || 0).toFixed(4)} TON`,
    promoSuccessWbc: (amount) => `Promo activated: +${Number(amount || 0).toLocaleString()} ${getCurrency()}`,
    promoFail: "Failed to activate promo code",
    rewardWbc: (amount) => `Reward: +${Number(amount || 0).toLocaleString()} ${getCurrency()}`,
    rewardKey: (amount) => `Reward: +${Number(amount || 0)} Zero-Day Key`,
    progress: (a, b) => `Progress: ${a} / ${b}`
  };
}

function syncTasksPromoTexts() {
  const tp = getTasksPromoText();

  const btnTasks = document.getElementById("btn-tasks");
  const btnPromo = document.getElementById("btn-promo");
  const tasksTitle = document.getElementById("tasks-panel-title");
  const promoTitle = document.getElementById("promo-panel-title");
  const promoApplyBtn = document.getElementById("promo-code-apply-btn");
  const promoStatus = document.getElementById("promo-code-status");
  const promoHintCard = document.querySelector("#promo-panel-overlay .info-card.market-info-card");
  const promoStrong = promoHintCard?.querySelector("p strong");
  const promoHint = promoHintCard?.querySelectorAll("p")[1];

  if (btnTasks) btnTasks.textContent = tp.tasksBtn;
  if (btnPromo) btnPromo.textContent = tp.promoBtn;
  if (tasksTitle) tasksTitle.textContent = tp.tasksTitle;
  if (promoTitle) promoTitle.textContent = tp.promoTitle;
  if (promoApplyBtn) promoApplyBtn.textContent = tp.promoApply;
  if (promoStrong) promoStrong.textContent = tp.activateCode;
  if (promoHint) promoHint.textContent = tp.enterCodeHint;

  if (promoStatus && !promoStatus.dataset.lockedText) {
    promoStatus.textContent = tp.promoWaiting;
  }
}

function getTaskDisplayName(taskKey) {
  const key = String(taskKey || "");

  if (currentLang === "RU") {
    const map = {
      ads_10_daily: "10 РЕКЛАМ / ДЕНЬ",
      ads_15_daily: "15 РЕКЛАМ / ДЕНЬ",
      ads_20_daily: "20 РЕКЛАМ / ДЕНЬ",
      login_streak_daily: "ЕЖЕДНЕВНЫЙ ВХОД",
      ref_valid_1: "1 АКТИВНЫЙ РЕФЕРАЛ",
      ref_valid_5: "5 АКТИВНЫХ РЕФЕРАЛОВ"
    };
    return map[key] || key;
  }

  const map = {
    ads_10_daily: "10 ADS / DAY",
    ads_15_daily: "15 ADS / DAY",
    ads_20_daily: "20 ADS / DAY",
    login_streak_daily: "DAILY LOGIN",
    ref_valid_1: "1 ACTIVE REFERRAL",
    ref_valid_5: "5 ACTIVE REFERRALS"
  };

  return map[key] || key;
}

function getTaskRewardText(task) {
  const tp = getTasksPromoText();

  if (Number(task?.reward_wbc || 0) > 0) {
    return tp.rewardWbc(task.reward_wbc);
  }

  if (Number(task?.reward_key || 0) > 0) {
    return tp.rewardKey(task.reward_key);
  }

  return "";
}

function renderTasksPanel(payload) {
  const wrap = document.getElementById("tasks-panel-content");
  if (!wrap) return;

  const tp = getTasksPromoText();
  const tasks = payload?.tasks || {};
  const entries = Object.values(tasks);

  if (!entries.length) {
    wrap.innerHTML = `
      <div class="info-card market-info-card">
        <p><strong>${tp.tasksTitle}</strong></p>
        <p>${tp.noTasks}</p>
      </div>
    `;
    return;
  }

  wrap.innerHTML = entries.map((task) => {
    const progressValue = Number(task.progress || 0);
    const targetValue = Number(task.target || 0);
    const progress = tp.progress(progressValue, targetValue);
    const reward = getTaskRewardText(task);
    const title = getTaskDisplayName(task.key);

    let buttonText = tp.claim;
    let buttonClass = "premium";
    let disabledAttr = "";
    let stateClass = "task-ready";

    if (task.claimed) {
      buttonText = tp.claimed;
      buttonClass = "ghost";
      disabledAttr = "disabled";
      stateClass = "task-claimed";
    } else if (!task.claimable) {
      buttonText = currentLang === "RU" ? "В ПРОЦЕССЕ" : "IN PROGRESS";
      buttonClass = "ghost";
      disabledAttr = "disabled";
      stateClass = "task-progress";
    }

    return `
      <div class="info-card market-info-card task-card ${stateClass}">
        <p><strong>${title}</strong></p>
        <p>${progress}</p>
        <p>${reward}</p>
        <div style="margin-top:12px;">
          <button
            class="wb-button ${buttonClass}"
            type="button"
            onclick="claimTaskReward('${String(task.key || "")}')"
            ${disabledAttr}
          >
            ${buttonText}
          </button>
        </div>
      </div>
    `;
  }).join("");
}

async function loadTasksPanel() {
  const wrap = document.getElementById("tasks-panel-content");
  if (!wrap) return;

  const tp = getTasksPromoText();

  wrap.innerHTML = `
    <div class="info-card market-info-card">
      <p><strong>${tp.tasksTitle}</strong></p>
      <p>${tp.tasksLoading}</p>
    </div>
  `;

  try {
    const payload = await API.getTasksStatus();

    if (!payload?.success) {
      wrap.innerHTML = `
        <div class="info-card market-info-card">
          <p><strong>${tp.tasksTitle}</strong></p>
          <p>${tp.tasksLoadFail}</p>
        </div>
      `;
      return;
    }

    renderTasksPanel(payload);
  } catch (e) {
    console.error("loadTasksPanel error:", e);
    wrap.innerHTML = `
      <div class="info-card market-info-card">
        <p><strong>${tp.tasksTitle}</strong></p>
        <p>${tp.tasksLoadFail}</p>
      </div>
    `;
  }
}

window.claimTaskReward = async (taskKey) => {
  try {
    const result = await API.claimTask(taskKey);

    if (!result?.success) {
      showNotify("error", result?.error || getTasksPromoText().tasksLoadFail);
      return;
    }

    userState = normalizeUserState({
      ...userState,
      balance: result.balance ?? userState.balance,
      wbc_balance: result.wbc_balance ?? userState.wbc_balance,
      ton_balance: result.ton_balance ?? userState.ton_balance,
      zeroDayKeys: result.zero_day_keys_balance ?? userState.zeroDayKeys
    });

    syncEnergyBase();
    updateUI();
    await loadTasksPanel();

    if (Number(result.reward_wbc || 0) > 0) {
      showNotify("success", getTasksPromoText().rewardWbc(result.reward_wbc));
    } else if (Number(result.reward_key || 0) > 0) {
      showNotify("success", getTasksPromoText().rewardKey(result.reward_key));
    } else {
      showNotify("success", currentLang === "RU" ? "Награда за задачу получена." : "Task reward received.");
    }

    return;
  } catch (e) {
    console.error("claimTaskReward error:", e);
    showNotify("error", getTasksPromoText().tasksLoadFail);
  }
};

async function handlePromoApply() {
  const input = document.getElementById("promo-code-input");
  const status = document.getElementById("promo-code-status");
  const tp = getTasksPromoText();

  const code = String(input?.value || "").trim();

  if (!code) {
    if (status) {
      status.textContent = tp.promoEmpty;
      status.dataset.lockedText = "1";
    }
    showNotify("warning", tp.promoEmpty);
    return;
  }

  if (status) {
    status.textContent = currentLang === "RU" ? "Подключение к узлу..." : "Linking to node...";
    status.dataset.lockedText = "1";
  }

  try {
    const result = await API.redeemPromo(code);

    if (!result?.success) {
      const msg = mapPromoErrorMessage(result?.error || tp.promoFail);
      if (status) status.textContent = msg;
      showNotify("error", msg, 3400);
      return;
    }

    userState = normalizeUserState({
      ...userState,
      balance: result.balance ?? userState.balance,
      wbc_balance: result.wbc_balance ?? userState.wbc_balance,
      ton_balance: result.ton_balance ?? userState.ton_balance
    });

    syncEnergyBase();
    updateUI();

    let okText = tp.promoFail;

    if (Number(result.reward_ton || 0) > 0) {
      okText = tp.promoSuccessTon(result.reward_ton);
    } else if (Number(result.reward_wbc || 0) > 0) {
      okText = tp.promoSuccessWbc(result.reward_wbc);
    }

    if (status) status.textContent = okText;
    if (input) input.value = "";

    showNotify("success", okText, 3200);
  } catch (e) {
    console.error("handlePromoApply error:", e);
    const failText = mapPromoErrorMessage(e?.message || tp.promoFail);
    if (status) status.textContent = failText;
    showNotify("error", failText, 3400);
  }
}

window.showTasksPanel = async () => {
  syncTasksPromoTexts();
  openPanel("tasks-panel-overlay");
  await loadTasksPanel();
};

window.showPromoPanel = async () => {
  syncTasksPromoTexts();

  const input = document.getElementById("promo-code-input");
  const status = document.getElementById("promo-code-status");

  if (input) input.value = "";
  if (status) {
    status.textContent = getTasksPromoText().promoWaiting;
    delete status.dataset.lockedText;
  }

  openPanel("promo-panel-overlay");
};

function getProtocolConfig() {
  const cfg = getConfig().PROTOCOL || {};
  return currentLang === "RU" ? (cfg.RU || {}) : (cfg.EN || {});
}

function getProtocolDrawText(status) {
  const p = getProtocolConfig();
  const poolState = String(status?.pool_state || "").trim().toLowerCase();

  if (poolState === "locked_ready_for_drop") {
    return p.drawLocked || "HACKER'S PRIZE POOL BLOCKED — READY TO DROP";
  }

  if (poolState === "completed") {
    return p.drawCompleted || "HACKER'S PRIZE POOL DROP COMPLETED";
  }

  return p.drawCharging || "HACKER'S PRIZE POOL IS CHARGING IN THE NETWORK";
}

function renderProtocolPanel(status = null) {
  const p = getProtocolConfig();

  const titleEl = document.getElementById("protocol-panel-title");
  const contentEl = document.getElementById("protocol-content");
  const backBtn = document.querySelector("#protocol-panel-overlay .wb-back-btn");

  if (titleEl) titleEl.textContent = p.title || "MISSION PROTOCOL";
  if (backBtn) backBtn.textContent = p.back || "← BACK";
  if (!contentEl) return;

  const drawText = getProtocolDrawText(status);

  contentEl.innerHTML = `
    <div class="protocol-card">
      <strong>${p.coreTitle || "TAP CORE"}</strong>
      <p>${p.coreText || "Tap the core to farm $WBC."}</p>
    </div>

    <div class="protocol-card">
      <strong>${p.adsTitle || "CODE INJECTION"}</strong>
      <p>${p.adsText || "Watch ads to get boosted rewards."}</p>
    </div>

    <div class="protocol-card">
      <strong>${p.rankTitle || "RANK UPGRADE"}</strong>
      <p>${p.rankText || "Ranks increase tap output only."}</p>
    </div>

    <div class="protocol-card">
      <strong>${p.keyTitle || "ZERO-DAY KEY"}</strong>
      <p>${p.keyText || "1 Key = 1 entry. Max 2 keys per round."}</p>
    </div>

    <div class="protocol-card">
      <strong>${p.activityTitle || "ACTIVITY LOGIC"}</strong>
      <p>${p.activityText || ""}</p>
    </div>

    <div class="protocol-highlight">
      <strong>${p.drawTitle || "DRAW STATUS"}</strong>
      <p>${drawText}</p>
    </div>

    <div class="protocol-target">
      <strong>${p.targetTitle || "TARGET"}</strong>
      <p>${p.targetText || ""}</p>
    </div>
  `;
}

window.showProtocol = async () => {
  const status = await refreshDrawStatusGlobal();
  renderProtocolPanel(status);
  openPanel("protocol-panel-overlay");
};

async function refreshZeroDayKeyPanel() {
  const balanceEl = document.getElementById("zero-key-balance-value");
  const enteredEl = document.getElementById("zero-key-entered-value");
  const buyBtn = document.getElementById("zero-key-buy-btn");
  const enterBtn = document.getElementById("zero-key-enter-btn");
  const statusLine = document.getElementById("zero-key-status-line");

  if (balanceEl) {
    balanceEl.textContent = Number(userState.zeroDayKeys || 0).toLocaleString();
  }

  if (enteredEl) {
    enteredEl.textContent = "0 / 2";
  }

  if (statusLine) {
    statusLine.textContent = t().zeroKeyStatusOpen;
  }

  const status = await API.getDrawStatus();

  if (status?.success) {
    const keys = Number(status.keys || 0);
    const entered = Number(status.entered || 0);
    const max = Number(status.max || 2);
    const poolState = String(status.pool_state || "").toLowerCase();
    const roundStatus = String(status.round_status || "").toLowerCase();

    userState.zeroDayKeys = keys;

    if (balanceEl) {
      balanceEl.textContent = keys.toLocaleString();
    }

    if (enteredEl) {
      enteredEl.textContent = `${entered} / ${max}`;
    }

    if (buyBtn) {
      buyBtn.disabled = false;
    }

    let enterDisabled = false;
    let lineText = t().zeroKeyStatusOpen;

    if (roundStatus !== "active" || poolState === "locked_ready_for_drop") {
      enterDisabled = true;
      lineText = t().zeroKeyStatusLocked;
    } else if (entered >= max) {
      enterDisabled = true;
      lineText = t().zeroKeyStatusLimit;
    } else if (keys <= 0) {
      enterDisabled = true;
      lineText = t().zeroKeyStatusNoKeys;
    }

    if (enterBtn) {
      enterBtn.disabled = enterDisabled;
    }

    if (statusLine) {
      statusLine.textContent = lineText;
    }

    updateAccountPanel();
    updatePrizePoolPanel(status);
  }
}

window.showZeroDayKeyPanel = async () => {
  await refreshZeroDayKeyPanel();
  openPanel("zero-key-panel-overlay");
};

async function handleZeroDayKeyBuy() {
  const result = await API.buyZeroDayKey();

  if (!result?.success) {
    const errorCode = String(result?.error || "").toLowerCase();

    if (errorCode === "no_wbc") {
      safeAlert(t().zeroKeyNoWbc);
    } else {
      safeAlert(t().zeroKeyBuyFail);
    }
    return;
  }

  userState.zeroDayKeys = Number(result.keys || 0);
  updateAccountPanel();
  await refreshZeroDayKeyPanel();
  safeAlert(t().zeroKeyBuyOk);
}

async function handleZeroDayKeyEnter() {
  const result = await API.enterDrawWithKey();

  if (!result?.success) {
    const errorCode = String(result?.error || "").toLowerCase();

    if (errorCode === "no_keys" || errorCode === "no_key") {
      safeAlert(t().zeroKeyNoKeys);
    } else if (errorCode === "limit") {
      safeAlert(t().zeroKeyLimit);
    } else if (errorCode === "draw_locked") {
      safeAlert(t().zeroKeyDrawLocked);
    } else {
      safeAlert(t().zeroKeyEnterFail);
    }
    return;
  }

  userState.zeroDayKeys = Number(result.keys || userState.zeroDayKeys || 0);
  updateAccountPanel();
  await refreshZeroDayKeyPanel();
  safeAlert(t().zeroKeyEnterOk);
}

window.closePanel = () => {
  closeAllPanels();

  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.classList.add("active");
  }
};

function getMonetagRewardedHandler() {
  const fn = window.show_10848170;
  if (typeof fn !== "function") {
    return null;
  }
  return fn;
}

function parseAdErrorMessage(err) {
  if (!err) return "";
  if (typeof err === "string") return err.toLowerCase();
  if (typeof err.message === "string") return err.message.toLowerCase();
  if (typeof err.error === "string") return err.error.toLowerCase();

  try {
    return JSON.stringify(err).toLowerCase();
  } catch {
    return String(err).toLowerCase();
  }
}

function isMonetagCancelResult(errText) {
  if (!errText) return false;

  return (
    errText.includes("cancel") ||
    errText.includes("close") ||
    errText.includes("closed") ||
    errText.includes("dismiss") ||
    errText.includes("skip") ||
    errText.includes("abort") ||
    errText.includes("aborted")
  );
}

window.showAds = async () => {
  if (adFlowLocked) {
    safeAlert(t().adBusy);
    return;
  }

  adFlowLocked = true;
  setAdsButtonBusy(true);

  try {
    const limitInfo = await API.checkAdLimit();
    if (!limitInfo?.canWatch) {
      safeAlert(t().adLimit);
      return;
    }

    const showRewarded = getMonetagRewardedHandler();
    if (!showRewarded) {
      safeAlert(t().adNotLoaded);
      return;
    }

    const tgUser = API.getTelegramUser?.() || null;
    const telegramId = tgUser?.id ? String(tgUser.id) : "anon";
    const ymid = `wbad_${telegramId}_${Date.now()}`;

    try {
      await showRewarded({ type: "preload", ymid });
    } catch (preloadErr) {
      console.warn("Monetag preload skipped:", preloadErr);
    }

    await showRewarded({ ymid });

    const rewardResp = await API.claimAdReward();

    if (rewardResp?.success) {
      userState = normalizeUserState({
        ...userState,
        balance: rewardResp.balance,
        wbc_balance: rewardResp.wbc_balance ?? rewardResp.balance ?? userState.wbc_balance,
        energy: rewardResp.energy,
        rank_id: rewardResp.rank_id ?? userState.rank_id,
        rank_expires_at: rewardResp.rank_expires_at ?? userState.rank_expires_at,
        ton_balance: rewardResp.ton_balance ?? userState.ton_balance
      });

      syncEnergyBase();
      updateUI();
      safeAlert(t().adRewardOk);
      return;
    }

    safeAlert(t().adRewardFail);
  } catch (e) {
    console.error("showAds error:", e);

    const adErrText = parseAdErrorMessage(e);
    if (isMonetagCancelResult(adErrText)) {
      safeAlert(t().adWatchFail);
      return;
    }

    safeAlert(`${t().adOpenFail}\n\n${t().adCooldownHint}`);
  } finally {
    adFlowLocked = false;
    setAdsButtonBusy(false);
  }
};

function showRankDetails(rankId) {
  const rank = getRankById(rankId);
  if (!rank) return;

  const nameEl = document.getElementById("rank-details-name");
  const priceEl = document.getElementById("rank-details-price");
  const durationEl = document.getElementById("rank-details-duration");
  const descEl = document.getElementById("rank-details-desc");

  if (nameEl) nameEl.textContent = rank.name;
  if (priceEl) priceEl.textContent = `${t().activationPrice}: ${getRankPriceLabel(rank)}`;

  const left = rank.id === userState.rank_id ? formatDurationLeft(userState.rank_expires_at) : null;
  if (durationEl) {
    durationEl.textContent = left
      ? t().activeLeft(left)
      : `${t().durationLabel}: ${getRankDurationDays()} days`;
  }

  if (descEl) {
    descEl.textContent =
      currentLang === "RU"
        ? (rank.descRU || rank.shortRU || "")
        : (rank.descEN || rank.shortEN || "");
  }

  if (rankBuyPrimaryBtn) {
    rankBuyPrimaryBtn.disabled = false;
    rankBuyPrimaryBtn.classList.remove("hidden", "primary", "premium", "ghost", "active-rank-btn");
    rankBuyPrimaryBtn.onclick = null;
  }

  if (rankBuySecondaryBtn) {
    rankBuySecondaryBtn.disabled = false;
    rankBuySecondaryBtn.classList.remove("hidden", "primary", "premium", "ghost", "active-rank-btn");
    rankBuySecondaryBtn.onclick = null;
  }

  if (rank.id === userState.rank_id) {
    if (rankBuyPrimaryBtn) {
      rankBuyPrimaryBtn.textContent = currentLang === "RU" ? "АКТИВЕН" : "ACTIVE";
      rankBuyPrimaryBtn.disabled = true;
      rankBuyPrimaryBtn.classList.add("active-rank-btn");
      rankBuyPrimaryBtn.onclick = null;
    }

    if (rankBuySecondaryBtn) {
      rankBuySecondaryBtn.classList.add("hidden");
      rankBuySecondaryBtn.onclick = null;
    }
  } else if (rank.id === 3) {
    if (rankBuyPrimaryBtn) {
      rankBuyPrimaryBtn.textContent = t().activateStars;
      rankBuyPrimaryBtn.classList.add("ghost");
      rankBuyPrimaryBtn.classList.remove("premium", "primary", "active-rank-btn");
      rankBuyPrimaryBtn.disabled = false;
      rankBuyPrimaryBtn.onclick = async () => {
        closeAllPanels();
        closeSidebar();
        await new Promise((resolve) => setTimeout(resolve, 120));
        await buyRankForStars(rank.id);
      };
    }

    if (rankBuySecondaryBtn) {
      rankBuySecondaryBtn.textContent = t().activateTon;
      rankBuySecondaryBtn.classList.remove("hidden", "ghost", "primary", "active-rank-btn");
      rankBuySecondaryBtn.classList.add("premium");
      rankBuySecondaryBtn.disabled = false;
      rankBuySecondaryBtn.onclick = async () => {
        closeAllPanels();
        closeSidebar();
        await new Promise((resolve) => setTimeout(resolve, 120));
        await buyRankForTon(rank.id);
      };
    }
  } else if (rank.id === 4 || rank.id === 5) {
    if (rankBuyPrimaryBtn) {
      rankBuyPrimaryBtn.textContent = t().activateTon;
      rankBuyPrimaryBtn.classList.remove("ghost", "active-rank-btn");
      rankBuyPrimaryBtn.classList.add("premium");
      rankBuyPrimaryBtn.disabled = false;
      rankBuyPrimaryBtn.onclick = async () => {
        closeAllPanels();
        closeSidebar();
        await new Promise((resolve) => setTimeout(resolve, 120));
        await buyRankForTon(rank.id);
      };
    }

    if (rankBuySecondaryBtn) {
      rankBuySecondaryBtn.textContent = t().acquireRank;
      rankBuySecondaryBtn.classList.remove("hidden", "premium", "active-rank-btn");
      rankBuySecondaryBtn.classList.add("ghost");
      rankBuySecondaryBtn.disabled = false;
      rankBuySecondaryBtn.onclick = async () => {
        await handleRankPurchase(rank.id, "WBC");
      };
    }
  } else {
    if (rankBuyPrimaryBtn) {
      rankBuyPrimaryBtn.textContent = t().acquireRank;
      rankBuyPrimaryBtn.classList.remove("premium", "active-rank-btn");
      rankBuyPrimaryBtn.classList.add("ghost");
      rankBuyPrimaryBtn.disabled = false;
      rankBuyPrimaryBtn.onclick = async () => {
        await handleRankPurchase(rank.id, "WBC");
      };
    }

    if (rankBuySecondaryBtn) {
      rankBuySecondaryBtn.classList.add("hidden");
      rankBuySecondaryBtn.onclick = null;
    }
  }

  openPanel("rank-details-overlay");
}

document.addEventListener("DOMContentLoaded", () => {
  const gateway = document.getElementById("gateway");

  if (gateway) {
    gateway.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open("https://t.me/hiddifyProxySale_bot", "_blank");
    });
  }

  if (withdrawBtn) {
    withdrawBtn.addEventListener("click", handleWithdrawRequest);
  }

  if (withdrawWalletInput) {
    withdrawWalletInput.addEventListener("input", () => {
      setManualWithdrawWallet(withdrawWalletInput.value);
    });

    withdrawWalletInput.addEventListener("change", () => {
      setManualWithdrawWallet(withdrawWalletInput.value);
    });

    withdrawWalletInput.addEventListener("blur", () => {
      setManualWithdrawWallet(withdrawWalletInput.value);
    });
  }

  const changeWalletBtn = document.getElementById("change-wallet-btn");
  if (changeWalletBtn) {
    changeWalletBtn.addEventListener("click", () => {
      if (!withdrawWalletInput) return;

      withdrawWalletInput.value = "";
      setManualWithdrawWallet("");
      delete withdrawWalletInput.dataset.walletAutofilled;
      withdrawWalletInput.focus();
    });
  }

  const promoCodeApplyBtn = document.getElementById("promo-code-apply-btn");
  if (promoCodeApplyBtn) {
    promoCodeApplyBtn.addEventListener("click", handlePromoApply);
  }

  const promoCodeInput = document.getElementById("promo-code-input");
  if (promoCodeInput) {
    promoCodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handlePromoApply();
      }
    });
  }

  syncTasksPromoTexts();
  
  const zeroKeyBuyBtn = document.getElementById("zero-key-buy-btn");
  const zeroKeyEnterBtn = document.getElementById("zero-key-enter-btn");

  if (zeroKeyBuyBtn) {
    zeroKeyBuyBtn.addEventListener("click", handleZeroDayKeyBuy);
  }

  if (zeroKeyEnterBtn) {
    zeroKeyEnterBtn.addEventListener("click", handleZeroDayKeyEnter);
  }
  bindOverlayClosers();
  applyTexts();
  loadUser();
  });

function updateRankLabel() {
  const el = document.getElementById("current-rank-label");
  if (!el) return;

  const rank = getRankById(userState.rank_id);
  if (!rank) {
    el.textContent = "";
    el.className = "rank-label hidden";
    return;
  }

  const left = userState.rank_id > 1 ? formatDurationLeft(userState.rank_expires_at) : null;

  const accentClass =
    rank.accent === "magenta"
      ? "rank-label-magenta"
      : rank.accent === "cyan"
        ? "rank-label-cyan"
        : "rank-label-silver";

  const meta = left
    ? `${t().rankLabel(rank.id)} • ${currentLang === "RU" ? "АКТИВЕН" : "ACTIVE"} • ${left}`
    : `${t().rankLabel(rank.id)} • ONLINE`;

  el.className = `rank-label ${accentClass}`;
  el.innerHTML = `
    <span class="rank-label-main">${rank.name}</span>
    <span class="rank-label-meta">${meta}</span>
  `;
}
