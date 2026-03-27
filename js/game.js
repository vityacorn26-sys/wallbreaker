const tg = window.Telegram?.WebApp || null;

let currentLang = "RU";

let userState = {
  balance: 0,
  energy: 100,
  rank_id: 1,
  zeroDayKeys: 0,
  walletConnected: false
};

let tapQueue = 0;
let tapWorkerRunning = false;
let tapAnimLocked = false;
let tapFlushTimer = null;

let localEnergyTicker = null;
let lastServerSyncTs = Date.now();
let lastServerEnergy = 100;

const MAX_ENERGY = 100;

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
    poolLive: "Формируется из рекламного пула",
    rankDuration: (days) => `Срок действия: ${days} дней`,
    acquireRank: "АКТИВИРОВАТЬ",
    details: "ПОДРОБНЕЕ",
    zeroDayPersist: "Сохраняется до розыгрыша. Максимум 2 ключа на один draw.",
    rankLabel: (id) => `R${id}`,
    tapOutput: "Tap Output",
    activationPrice: "Цена активации",
    durationLabel: "Срок действия"
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
    poolLive: "Built from the ad-funded prize pool",
    rankDuration: (days) => `Duration: ${days} days`,
    acquireRank: "ACTIVATE",
    details: "DETAILS",
    zeroDayPersist: "Persists until draw. Maximum 2 keys per draw.",
    rankLabel: (id) => `R${id}`,
    tapOutput: "Tap Output",
    activationPrice: "Activation Price",
    durationLabel: "Duration"
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
    rank_id: Number(data?.rank_id || 1),
    zeroDayKeys: Number(data?.zeroDayKeys || data?.zero_day_keys || userState.zeroDayKeys || 0),
    walletConnected: Boolean(data?.walletConnected || data?.wallet_connected || userState.walletConnected || false)
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

function updateAccountPanel() {
  const rank = getRankById(userState.rank_id);

  const rankValue = document.getElementById("account-rank-value");
  const tapValue = document.getElementById("account-tap-value");
  const keysValue = document.getElementById("account-keys-value");
  const walletStatus = document.getElementById("account-wallet-status");
  const withdrawStatus = document.getElementById("account-withdraw-status");

  if (rankValue) rankValue.textContent = rank?.name || "Proxy Hacker";
  if (tapValue) tapValue.textContent = `${Number(rank?.mult || 10).toLocaleString()} ${getCurrency()} / tap`;
  if (keysValue) keysValue.textContent = Number(userState.zeroDayKeys || 0).toLocaleString();
  if (walletStatus) walletStatus.textContent = userState.walletConnected ? "Connected" : t().notConnected;
  if (withdrawStatus) withdrawStatus.textContent = t().noWithdraws;

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
  if (ads) ads.textContent = menu.codeInjection || "CODE INJECTION (+1500)";
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

    const badgeEl = card.querySelector(".market-rank-badge");
    const iconEl = card.querySelector(".market-rank-icon");
    const pEls = card.querySelectorAll("p");
    const nameStrong = card.querySelector("strong");
    const btn = card.querySelector("button");

    if (badgeEl) {
      badgeEl.textContent = t().rankLabel(rank.id);
      badgeEl.classList.toggle("market-rank-badge-ton", rank.unlockMode === "ton" || rank.id === 5);
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
      pEls[2].textContent =
        rank.unlockMode === "ton" && Number(rank.priceTON || 0) > 0
          ? `${Number(rank.priceTON)} TON`
          : `${Number(rank.priceWBC || 0).toLocaleString()} ${getCurrency()}`;
    }

    if (pEls[3]) {
      pEls[3].textContent = t().rankDuration(getRankDurationDays());
    }

    if (btn) {
      btn.textContent = t().details;
      btn.classList.toggle("premium", rank.unlockMode === "ton" || rank.id === 5);
      btn.classList.toggle("ghost", !(rank.unlockMode === "ton" || rank.id === 5));
      btn.onclick = () => openRankDetails(rank.id);
    }
  });

  const infoCard = marketOverlay.querySelector(".info-card");
  if (infoCard) {
    const pEls = infoCard.querySelectorAll("p");
    if (pEls[0]) pEls[0].innerHTML = "<strong>Zero-Day Key</strong>";
    if (pEls[1]) {
      pEls[1].textContent = `${getZeroDayKeyPrice().toLocaleString()} ${getCurrency()} = 1 Zero-Day Key`;
    }
    if (pEls[2]) {
      pEls[2].textContent = t().zeroDayPersist;
    }
  }
}

function openRankDetails(rankId) {
  const rank = getRankById(rankId);
  if (!rank) return;

  const overlay = document.getElementById("rank-details-overlay");
  const title = document.getElementById("rank-details-title");
  const name = document.getElementById("rank-details-name");
  const price = document.getElementById("rank-details-price");
  const duration = document.getElementById("rank-details-duration");
  const desc = document.getElementById("rank-details-desc");
  const actionBtn = overlay?.querySelector(".wb-button");

  if (title) title.textContent = `${t().rankDetailsTitle} • R${rank.id}`;
  if (name) name.textContent = `${rank.name} • ${Number(rank.mult).toLocaleString()} ${getCurrency()} / tap`;

  if (price) {
    price.textContent =
      rank.unlockMode === "ton" && Number(rank.priceTON || 0) > 0
        ? `${t().activationPrice}: ${Number(rank.priceTON)} TON`
        : `${t().activationPrice}: ${Number(rank.priceWBC || 0).toLocaleString()} ${getCurrency()}`;
  }

  if (duration) {
    duration.textContent = `${t().durationLabel}: ${getRankDurationDays()} days`;
    if (currentLang === "RU") {
      duration.textContent = `${t().durationLabel}: ${getRankDurationDays()} дней`;
    }
  }

  if (desc) {
    desc.textContent = currentLang === "RU" ? rank.descRU : rank.descEN;
  }

  if (actionBtn) {
    actionBtn.textContent = t().acquireRank;
    actionBtn.onclick = () => {
      const priceText =
        rank.unlockMode === "ton" && Number(rank.priceTON || 0) > 0
          ? `${Number(rank.priceTON)} TON`
          : `${Number(rank.priceWBC || 0).toLocaleString()} ${getCurrency()}`;

      safeAlert(
        `${t().rankLabel(rank.id)} • ${rank.name}\n\n${t().tapOutput}: ${Number(rank.mult).toLocaleString()} ${getCurrency()} / tap\n${t().activationPrice}: ${priceText}\n${t().rankDuration(getRankDurationDays())}\n\nServer-side activation подключим следующим пакетом.`
      );
    };
  }

  openPanel("rank-details-overlay");
}

window.openDarknetMarket = () => {
  renderMarketPanel();
  openPanel("market-panel-overlay");
};

window.showRanks = () => {
  window.openDarknetMarket();
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
    el.className = "rank-label";
    return;
  }

  el.textContent = rank.name;

  const accentMap = {
    silver: "r1",
    cyan: "r2",
    magenta: "r3"
  };

  let rankClass = accentMap[rank.accent] || "r1";

  if (rank.id === 4) rankClass = "r4";
  if (rank.id === 5) rankClass = "r5";

  el.className = "rank-label " + rankClass;
}
