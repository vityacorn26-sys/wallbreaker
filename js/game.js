const tg = window.Telegram?.WebApp || null;

let currentLang = "RU";

let userState = {
  balance: 0,
  energy: 100,
  rank_id: 1
};

let tapQueue = 0;
let tapWorkerRunning = false;
let tapAnimLocked = false;
let tapFlushTimer = null;

let localEnergyTicker = null;
let lastServerSyncTs = Date.now();
let lastServerEnergy = 100;

const MAX_ENERGY = 100;
const ENERGY_REGEN_SECONDS = 12;

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
  return getConfig().MENU || {};
}

function getMenuRuConfig() {
  return getConfig().MENU_RU || {};
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

function getAdRewardValue() {
  return Number(getGameConfig().ADS_REWARD_WBC || 1500);
}

function getReferralPercent() {
  return Number(getGameConfig().REFERRAL_PERCENT || 10);
}

function getZeroDayKeyPrice() {
  return Number(getGameConfig().ZERO_DAY_KEY_PRICE || 2000000);
}

function getRootInjectionTon() {
  return Number(getGameConfig().ROOT_INJECTION_TON || 0.5);
}

function getRankDurationDays() {
  return Number(getGameConfig().RANK_DURATION_DAYS || 7);
}

function getRankById(rankId) {
  const ranks = getRanksConfig();
  return ranks[String(rankId)] || ranks[rankId] || ranks["1"] || ranks[1] || null;
}

const I18N = {
  RU: {
    adLimit: "Лимит рекламы достигнут",
    adNotLoaded: "AdsGram SDK не загрузился. Перезапусти бота.",
    adOpenFail: "Реклама сейчас не открылась. Попробуй ещё раз.",
    adRewardOk: "Награда получена",
    adRewardFail: "Ошибка начисления награды",
    adWatchFail: "Реклама не была досмотрена",
    userLoadFail: "Ошибка загрузки профиля",
    initDataFail: "Telegram initData не найден",
    refsText: (link) =>
      `Referral Node:\n${link}\n\nБонус: ${getReferralPercent()}% от рекламной награды приглашённых.`,
    leaderboardSoon:
      "Breach Board уже на линии, но панель ещё собирается.",
    marketTitle: "Darknet Market",
    marketText:
      `Darknet Market\n\n` +
      `2,000,000 ${getCurrency()} = 1 Zero-Day Key\n` +
      `Срок рангов: ${getRankDurationDays()} дней\n\n` +
      `RANK 2 — Tunnel Master\n` +
      `RANK 3 — Firewall Breaker\n` +
      `RANK 4 — Root Operator\n` +
      `RANK 5 — Cyber Legend`,
    rankTitle: "Root Injection",
    rankText:
      `Root Injection\n\n` +
      `${getRootInjectionTon()} TON — premium-support entry.\n` +
      `Панель покупки будет подключена следующим пакетом.`,
    adCooldownHint:
      "Проверь, что реклама реально стартовала. Если нет — попробуй ещё раз через пару секунд.",
    fatalError: "Ошибка запуска",
    accountSoon:
      "Account panel уже в очереди. Подключим её следующим этапом.",
    close: "ЗАКРЫТЬ"
  },
  EN: {
    adLimit: "Ad limit reached",
    adNotLoaded: "AdsGram SDK not loaded. Restart the bot.",
    adOpenFail: "Ad failed to open. Please try again.",
    adRewardOk: "Reward received",
    adRewardFail: "Reward credit error",
    adWatchFail: "Ad was not fully watched",
    userLoadFail: "User loading error",
    initDataFail: "Telegram initData not found",
    refsText: (link) =>
      `Referral Node:\n${link}\n\nBonus: ${getReferralPercent()}% from invited users' ad rewards.`,
    leaderboardSoon:
      "Breach Board is being assembled. The panel is coming soon.",
    marketTitle: "Darknet Market",
    marketText:
      `Darknet Market\n\n` +
      `2,000,000 ${getCurrency()} = 1 Zero-Day Key\n` +
      `Rank duration: ${getRankDurationDays()} days\n\n` +
      `RANK 2 — Tunnel Master\n` +
      `RANK 3 — Firewall Breaker\n` +
      `RANK 4 — Root Operator\n` +
      `RANK 5 — Cyber Legend`,
    rankTitle: "Root Injection",
    rankText:
      `Root Injection\n\n` +
      `${getRootInjectionTon()} TON — premium-support entry.\n` +
      `The purchase panel will be connected in the next package.`,
    adCooldownHint:
      "Make sure the ad actually started. If it did not, try again in a few seconds.",
    fatalError: "Launch error",
    accountSoon:
      "Account panel is queued next. It will be connected in the next step.",
    close: "CLOSE"
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
    rank_id: Number(data?.rank_id || 1)
  };
}

function syncEnergyBase() {
  lastServerEnergy = Math.max(
    0,
    Math.min(MAX_ENERGY, Number(userState.energy || 0))
  );
  lastServerSyncTs = Date.now();
}

function getRenderedEnergy() {
  const elapsedMs = Date.now() - lastServerSyncTs;
  const gained = Math.floor(elapsedMs / (ENERGY_REGEN_SECONDS * 1000));
  return Math.max(0, Math.min(MAX_ENERGY, lastServerEnergy + gained));
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
}

function applyTexts() {
  const menu = currentLang === "RU" ? getMenuRuConfig() : getMenuConfig();

  const refs = document.getElementById("btn-refs");
  const top = document.getElementById("btn-top");
  const market = document.getElementById("btn-market");
  const close = document.getElementById("btn-close");
  const rank = document.getElementById("btn-rank");
  const ads = document.getElementById("btn-ads");
  const balanceCurrencyEl = document.getElementById("balance-currency");

  if (refs) refs.textContent = menu.referralNode || "REFERRAL NODE";
  if (top) top.textContent = menu.breachBoard || "BREACH BOARD";
  if (market) market.textContent = menu.darknetMarket || "DARKNET MARKET";
  if (close) close.textContent = menu.close || t().close;
  if (rank) rank.textContent = menu.rootInjection || "ROOT INJECTION: 0.5 TON";
  if (ads) ads.textContent = menu.codeInjection || "CODE INJECTION (+1500)";
  if (balanceCurrencyEl) balanceCurrencyEl.textContent = getCurrency();

  const ru = document.getElementById("lang-ru");
  const en = document.getElementById("lang-en");

  if (ru) ru.classList.toggle("active-lang", currentLang === "RU");
  if (en) en.classList.toggle("active-lang", currentLang === "EN");

  updateUI();
}

window.setLang = (lang) => {
  currentLang = lang === "EN" ? "EN" : "RU";
  applyTexts();
};

async function loadUser() {
  try {
    showLoadingScreen();

    if (!tg?.initData) {
      showFatalError(t().initDataFail);
      return;
    }

    const data = await API.getUser();

    if (!data) {
      showFatalError(t().userLoadFail);
      return;
    }

    userState = normalizeUserState(data);
    tapQueue = 0;
    syncEnergyBase();
    applyTexts();
    startLocalEnergyTicker();
    showGameScreen();
  } catch (e) {
    console.error("Load user error:", e);
    showFatalError(t().userLoadFail);
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

function getTapValueForCurrentRank() {
  const rank = getRankById(userState.rank_id);
  return Number(rank?.mult || 10);
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
          rank_id: data.rank_id ?? userState.rank_id
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

  // Лёгкий локальный отклик по энергии без доверия клиенту как источнику истины.
  userState.energy = Math.max(0, visibleEnergy - 1);
  syncEnergyBase();
  updateUI();

  if (tapFlushTimer) clearTimeout(tapFlushTimer);
  tapFlushTimer = setTimeout(() => {
    processTapQueue();
  }, 90);
};

window.toggleMenu = () => {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.toggle("active");
};

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
      const name =
        row?.username?.trim()
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

window.openDarknetMarket = () => {
  safeAlert(t().marketText);
};

window.openMarket = () => {
  safeAlert(t().rankText);
};

window.showRanks = () => {
  window.openDarknetMarket();
};

window.showAccount = () => {
  safeAlert(t().accountSoon);
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

function parseAdErrorMessage(error) {
  const raw = String(error?.message || error || "").toLowerCase();

  if (!raw) return t().adOpenFail;
  if (raw.includes("not fully watched")) return t().adWatchFail;
  if (raw.includes("cancel")) return t().adWatchFail;
  if (raw.includes("close")) return t().adWatchFail;
  if (raw.includes("sdk")) return t().adNotLoaded;
  if (raw.includes("block")) return t().adOpenFail;
  if (raw.includes("init")) return t().adOpenFail;

  return t().adOpenFail;
}

window.showAds = async () => {
  try {
    const limit = await API.checkAdLimit();

    if (!limit?.canWatch) {
      safeAlert(t().adLimit);
      return;
    }

    const adController = getAdsgramController();

    if (!adController || typeof adController.show !== "function") {
      safeAlert(t().adNotLoaded);
      return;
    }

    let adOpened = false;

    try {
      await adController.show();
      adOpened = true;
    } catch (adErr) {
      console.error("Adsgram show error:", adErr);
      safeAlert(parseAdErrorMessage(adErr));
      return;
    }

    if (!adOpened) {
      safeAlert(`${t().adOpenFail}\n\n${t().adCooldownHint}`);
      return;
    }

    const reward = await API.claimAdReward();

    if (reward?.success) {
      userState = normalizeUserState({
        ...userState,
        balance: reward.balance,
        energy: reward.energy,
        rank_id: reward.rank_id ?? userState.rank_id
      });

      tapQueue = 0;
      syncEnergyBase();
      updateUI();
      safeAlert(t().adRewardOk);
      return;
    }

    safeAlert(t().adRewardFail);
  } catch (e) {
    console.error("showAds fatal error:", e);
    safeAlert(t().adOpenFail);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const gateway = document.getElementById("gateway");

  if (gateway) {
    gateway.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.open("https://t.me/hiddifyProxySale_bot", "_blank");
    });
  }

  applyTexts();
  loadUser();
});
