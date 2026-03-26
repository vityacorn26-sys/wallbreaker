window.CONFIG = {
  API_BASE: "https://api.setgot.qzz.io",
  ADSGRAM_BLOCK_ID: "25766",

  GAME: {
    CURRENCY: "$WBC",
    ENERGY_LABEL: "CPU",
    ADS_REWARD_WBC: 1500,
    REFERRAL_PERCENT: 10,
    ZERO_DAY_KEY_PRICE: 2000000,
    ROOT_INJECTION_TON: 0.5,
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
      accent: "cyan",
      shortRU: "Мастер безопасных туннелей.",
      shortEN: "Master of secure tunnels.",
      descRU:
        "Открывает стабильный bypass-режим и усиливает добычу $WBC. Активен 7 дней.",
      descEN:
        "Unlocks a stable bypass mode and boosts $WBC extraction. Active for 7 days."
    },

    3: {
      id: 3,
      key: "firewall_breaker",
      name: "Firewall Breaker",
      img: "assets/cat3.jpg",
      mult: 60,
      unlockMode: "wbc",
      priceWBC: 750000,
      accent: "magenta",
      shortRU: "Ломает активную защиту.",
      shortEN: "Breaks active defense layers.",
      descRU:
        "Ускоряет прорыв сквозь защитные слои и резко повышает доход с тапа. Активен 7 дней.",
      descEN:
        "Speeds up breach through defensive layers and sharply increases tap income. Active for 7 days."
    },

    4: {
      id: 4,
      key: "root_operator",
      name: "Root Operator",
      img: "assets/cat4.jpg",
      mult: 150,
      unlockMode: "wbc",
      priceWBC: 2250000,
      accent: "cyan",
      shortRU: "Доступ к глубокому уровню системы.",
      shortEN: "Deep-level system access.",
      descRU:
        "Продвинутый ранг для тяжёлых взломов и ускоренного накопления $WBC. Активен 7 дней.",
      descEN:
        "Advanced rank for heavy breaches and accelerated $WBC accumulation. Active for 7 days."
    },

    5: {
      id: 5,
      key: "cyber_legend",
      name: "Cyber Legend",
      img: "assets/cat5.jpg",
      mult: 400,
      unlockMode: "wbc",
      priceWBC: 6000000,
      accent: "magenta",
      shortRU: "Легенда сетевого вторжения.",
      shortEN: "Legend of network intrusion.",
      descRU:
        "Максимальный боевой ранг с экстремальным tap-output для штурма prize pool. Активен 7 дней.",
      descEN:
        "Maximum combat rank with extreme tap output for assaulting the prize pool. Active for 7 days."
    }
  },

  MENU: {
    rootInjection: "ROOT INJECTION: 0.5 TON",
    codeInjection: "CODE INJECTION (+1500)",
    referralNode: "REFERRAL NODE",
    breachBoard: "BREACH BOARD",
    darknetMarket: "DARKNET MARKET",
    account: "ACCOUNT",
    close: "CLOSE"
  },

  MENU_RU: {
    rootInjection: "ROOT INJECTION: 0.5 TON",
    codeInjection: "CODE INJECTION (+1500)",
    referralNode: "РЕФЕРАЛЬНЫЙ УЗЕЛ",
    breachBoard: "ДОСКА ВЗЛОМА",
    darknetMarket: "ДАРКНЕТ-МАРКЕТ",
    account: "АККАУНТ",
    close: "ЗАКРЫТЬ"
  },

  SYSTEM_TEXT: {
    zeroDayKeyName: "Zero-Day Key",
    zeroDayKeyNameRU: "Zero-Day Key",
    prizePoolName: "Prize Pool",
    prizePoolNameRU: "Призовой пул",
    walletStatusName: "Wallet Status",
    walletStatusNameRU: "Статус кошелька",
    withdrawName: "Withdraw",
    withdrawNameRU: "Вывод"
  }
};
