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
    adNotLoaded: "AdsGram SDK не загрузился. Перезапусти бота.",
    adOpenFail: "Реклама сейчас не открылась. Попробуй ещё раз.",
    adRewardOk: "Награда получена",
    adRewardFail: "Ошибка начисления награды",
    adWatchFail: "Реклама не была досмотрена",
    adBusy: "Реклама уже загружается. Подожди несколько секунд.",
    adLoading: "ЗАГРУЗКА РЕКЛАМЫ...",
    userLoadFail: "Ошибка загрузки профиля",
    initDataFail: "Telegram initData не найден",
    refsText: (link) =>
      `Referral Node:\n${link}\n\nБонус: ${getReferralPercent()}% от рекламной награды приглашённых.`,
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
    walletStatus: "Статус кошелька",
    withdrawStatus: "Статус вывода",
    notConnected: "Не подключён",
    noWithdraws: "Запросов на вывод нет",
    poolLive: "Пул заряжается в сети",
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
    adNotLoaded: "AdsGram SDK not loaded. Restart the bot.",
    adOpenFail: "Ad failed to open. Please try again.",
    adRewardOk: "Reward received",
    adRewardFail: "Reward credit error",
    adWatchFail: "Ad was not fully watched",
    adBusy: "Ad is already loading. Please wait a few seconds.",
    adLoading: "LOADING AD...",
    userLoadFail: "User loading error",
    initDataFail: "Telegram initData not found",
    refsText: (link) =>
      `Referral Node:\n${link}\n\nBonus: ${getReferralPercent()}% from invited users' ad rewards.`,
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
    walletStatus: "Wallet Status",
    withdrawStatus: "Withdraw Status",
    notConnected: "Not connected",
    noWithdraws: "No withdraw requests",
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

function safeAlert(message) {
  if (tg?.showAlert) {
    tg.showAlert(String(message));
  } else {
    alert(String(message));
  }
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

function updatePrizePoolPanel() {
  const prizePoolLive = document.getElementById("prize-pool-live-value");
  const accountPrizePool = document.getElementById("account-prize-pool-value");
  const poolText = t().poolLive;

  if (prizePoolLive) prizePoolLive.textContent = poolText;
  if (accountPrizePool) accountPrizePool.textContent = poolText;
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

  const enteredWallet = withdrawWalletInput?.value?.trim() || "";
  const sessionWallet = userState.lastWithdraw?.wallet || "";
  const connectedTonWallet = getTonWalletShort();

  if (walletStatus) {
    if (connectedTonWallet) {
      walletStatus.textContent = connectedTonWallet;
    } else if (sessionWallet) {
      walletStatus.textContent = sessionWallet;
    } else if (enteredWallet) {
      walletStatus.textContent = enteredWallet;
    } else {
      walletStatus.textContent = t().notConnected;
    }
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
  if (cards[4]) cards[4].querySelector("strong").textContent = t().walletStatus;
  if (cards[5]) cards[5].querySelector("strong").textContent = t().withdrawStatus;
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
  const balanceCurrencyEl = document.getElementById("balance-currency");

  if (refs) refs.textContent = menu.referralNode || "REFERRAL NODE";
  if (top) top.textContent = menu.breachBoard || "BREACH BOARD";
  if (market) market.textContent = menu.darknetMarket || "DARKNET MARKET";
  if (close) close.textContent = menu.close || "CLOSE";
  if (ads) {
    ads.textContent = adFlowLocked
      ? t().adLoading
      : (menu.codeInjection || "CODE INJECTION (+1500)");
  }
  if (account) account.textContent = menu.account || "ACCOUNT";
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
      tonBuyLocked = false;
      return;
    }

    const create = await API.createTonPurchase(rankId);

    if (!create?.success) {
      safeAlert(create?.error || t().tonCreateFail);
      return;
    }

    const wallet = String(create.wallet || "").trim();
    const payload = String(create.payload || "").trim();
    const amountTon = Number(create.amount_ton || 0);

    if (!wallet || !payload || !(amountTon > 0)) {
      safeAlert(t().tonCreateFail);
      return;
    }

    const ui = initTonConnect();
    if (!ui) {
      safeAlert(t().tonWalletInitFail);
      return;
    }

    const tx = {
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: wallet,
          amount: toNanoString(amountTon)
        }
      ]
    };

    let txResult = null;

    try {
      txResult = await ui.sendTransaction(tx);
    } catch (e) {
      console.error("TON sendTransaction error:", e);
      const text = String(e?.message || e || "").toLowerCase();

      if (
        text.includes("declined") ||
        text.includes("reject") ||
        text.includes("cancel") ||
        text.includes("close")
      ) {
        safeAlert(t().tonWalletRejected);
      } else {
        safeAlert(t().tonConfirmFail);
      }
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
    safeAlert(t().tonConfirmFail);
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

window.showRefs = () => {
  const userId = tg?.initDataUnsafe?.user?.id?.toString() || "";
  const link = `https://t.me/BypassWallBot/play?start=${userId}`;
  safeAlert(t().refsText(link));
};

window.showLeaderboard = async () => {
  try {
    const rows = await API.getLeaderboard();

    if (!Array.isArray(rows) || rows.length === 0) {
      safeAlert(t().leaderboardSoon);
      return;
    }

    const topRows = rows.slice(0, 10).map((row, index) => {
      const name = row?.username?.trim()
        ? `@${row.username}`
        : `ID ${row?.telegramId || "unknown"}`;

      const balance = Number(row?.balance || 0).toLocaleString();
      return `${index + 1}. ${name} — ${balance} ${getCurrency()}`;
    });

    safeAlert(topRows.join("\n"));
  } catch (e) {
    console.error("showLeaderboard error:", e);
    safeAlert(t().leaderboardSoon);
  }
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

window.showAccount = () => {
  updateAccountPanel();
  openPanel("account-panel-overlay");
};

window.closePanel = () => {
  closeAllPanels();

  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    sidebar.classList.add("active");
  }
};

function getAdsgramController() {
  if (!window.Adsgram || typeof window.Adsgram.init !== "function") {
    return null;
  }

  try {
    return window.Adsgram.init({
      blockId: getConfig().ADSGRAM_BLOCK_ID || "25766"
    });
  } catch (e) {
    console.error("AdsGram init error:", e);
    return null;
  }
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

function isAdsgramRewardResult(result) {
  if (!result) return false;
  if (result === true) return true;

  const done = result?.done;
  const state = result?.state;
  const status = result?.status;
  const event = result?.event;
  const type = result?.type;

  if (done === true) return true;

  const values = [done, state, status, event, type]
    .filter((v) => v !== undefined && v !== null)
    .map((v) => String(v).toLowerCase().trim());

  return values.some((v) =>
    v === "done" ||
    v === "reward" ||
    v === "completed" ||
    v === "complete" ||
    v === "finish" ||
    v === "finished" ||
    v === "success" ||
    v === "ok" ||
    v === "shown"
  );
}

function isAdsgramCancelResult(errText) {
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

    const controller = getAdsgramController();
    if (!controller) {
      safeAlert(t().adNotLoaded);
      return;
    }

    const result = await controller.show();
    console.log("AdsGram result:", result);

    if (!isAdsgramRewardResult(result)) {
      safeAlert(t().adWatchFail);
      return;
    }

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
    if (isAdsgramCancelResult(adErrText)) {
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

  const statusText = left
    ? (currentLang === "RU" ? `АКТИВЕН • ${left}` : `ACTIVE • ${left}`)
    : (currentLang === "RU" ? "ONLINE" : "ONLINE");

  const prefix =
    currentLang === "RU"
      ? ">>> RANK PROTOCOL"
      : ">>> RANK PROTOCOL";

  el.className = `rank-label ${accentClass}`;
  el.innerHTML = `
    <span class="rank-label-prefix">${prefix}</span>
    <span class="rank-label-main">${rank.name}</span>
    <span class="rank-label-meta">${t().rankLabel(rank.id)} • ${statusText}</span>
  `;
}
