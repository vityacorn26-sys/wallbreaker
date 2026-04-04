window.CONFIG = {
  API_BASE: "https://wbapi.corterbs.dpdns.org",
  ADSGRAM_BLOCK_ID: "25760",

  GAME: {
    CURRENCY: "$WBC",
    ENERGY_LABEL: "CPU",
    ENERGY_REGEN_SECONDS: 30,
    ADS_REWARD_WBC: 1500,
    REFERRAL_PERCENT: 10,
    ZERO_DAY_KEY_PRICE: 2000000,
    ZERO_DAY_KEY_MAX_PER_DRAW: 2,
    RANK_DURATION_DAYS: 7
  },

  RANKS: {
    1: {
      id: 1,
      key: "proxy_hacker",
      name: "Proxy Hacker",
      img: "assets/cat1.jpg",
      mult: 10,
      unlockMode: "default",
      priceWBC: 0,
      priceTON: 0,
      priceStars: 0,
      accent: "silver",
      shortRU: "Стартовый оператор сети.",
      shortEN: "Entry-level network operator.",
      descRU: "Базовый ранг для первых атак на цифровую стену.",
      descEN: "Base rank for first attacks on the digital wall."
    },

    2: {
      id: 2,
      key: "tunnel_master",
      name: "Tunnel Master",
      img: "assets/cat2.jpg",
      mult: 25,
      unlockMode: "wbc",
      priceWBC: 250000,
      priceTON: 0,
      priceStars: 0,
      accent: "cyan",
      shortRU: "Мастер безопасных туннелей.",
      shortEN: "Master of secure tunnels.",
      descRU: "Стабилизирует обход, усиливает extraction и держит линию под контролем. Активен 7 дней.",
      descEN: "Stabilizes bypass, boosts extraction and keeps the line under control. Active for 7 days."
    },

    3: {
      id: 3,
      key: "firewall_breaker",
      name: "Firewall Breaker",
      img: "assets/cat3.jpg",
      mult: 60,
      unlockMode: "hybrid_ton_stars",
      priceWBC: 0,
      priceTON: 0.5,
      priceStars: 250,
      accent: "magenta",
      shortRU: "Золотая середина для пробоя защиты.",
      shortEN: "The golden-middle breach rank.",
      descRU: "Премиальный ранг для уверенного пробоя защитных слоёв и мощного роста tap-output. Активен 7 дней.",
      descEN: "Premium rank for confident breach through defensive layers and stronger tap output. Active for 7 days."
    },

    4: {
      id: 4,
      key: "root_operator",
      name: "Root Operator",
      img: "assets/cat4.jpg",
      mult: 150,
      unlockMode: "hybrid",
      priceWBC: 750000,
      priceTON: 1,
      priceStars: 0,
      accent: "cyan",
      shortRU: "Глубокий доступ к системному ядру.",
      shortEN: "Deep access to the system core.",
      descRU: "Продвинутый ранг для тяжёлых взломов, ускоренного накопления и жёсткого давления на prize pool. Активен 7 дней.",
      descEN: "Advanced rank for heavy breaches, faster accumulation and stronger pressure on the prize pool. Active for 7 days."
    },

    5: {
      id: 5,
      key: "cyber_legend",
      name: "Cyber Legend",
      img: "assets/cat5.jpg",
      mult: 400,
      unlockMode: "hybrid",
      priceWBC: 1300000,
      priceTON: 2.5,
      priceStars: 0,
      accent: "magenta",
      shortRU: "Легенда яркого кибер-вторжения.",
      shortEN: "Legend of vivid cyber intrusion.",
      descRU: "Максимальный боевой ранг с экстремальным tap-output для штурма prize pool. Активен 7 дней.",
      descEN: "Maximum combat rank with extreme tap output for assaulting the prize pool. Active for 7 days."
    }
  },

  MENU: {
    codeInjection: "CODE INJECTION (+1500)",
    referralNode: "REFERRAL NODE",
    breachBoard: "BREACH BOARD",
    darknetMarket: "DARKNET MARKET",
    account: "ACCOUNT",
    close: "CLOSE"
  },

  MENU_RU: {
  codeInjection: "CODE INJECTION (+1500)",
  referralNode: "REFERRAL NODE",
  breachBoard: "BREACH BOARD",
  darknetMarket: "ДАРКНЕТ-МАРКЕТ",
  account: "АККАУНТ",
  close: "ЗАКРЫТЬ"
},

  SYSTEM_TEXT: {
    zeroDayKeyName: "Zero-Day Key",
    zeroDayKeyNameRU: "Zero-Day Key",
    zeroDayKeyPersistEN: "Сохраняется до розыгрыша",
    zeroDayKeyPersistRU: "Сохраняется до розыгрыша",
    prizePoolName: "Prize Pool",
    prizePoolNameRU: "Призовой пул",
    walletStatusName: "Wallet Status",
    walletStatusNameRU: "Статус кошелька",
    withdrawName: "Withdraw",
    withdrawNameRU: "Вывод"
  },

  DRAW: {
    MAX_KEYS_PER_USER_PER_DRAW: 2,
    POOL_SPLIT: {
      winnersTop10: 40,
      winners11to30: 40,
      longTail: 20
    },
    MIN_LONGTAIL_PAYOUT_TON: 0.3,
    SCORE_WEIGHTS: {
      zeroDayKey: 2.0,
      referral: 1.6,
      donationTON: 1.5,
      adsActivity: 1.25,
      tapsActivity: 1.1
    }
  }
};
