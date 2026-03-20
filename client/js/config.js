const CONFIG = {
    // Твой основной домен для связи с сервером через Cloudflare
    API_URL: "https://api.setgot.qzz.io", 
    
    // Тестовый ID Adsgram (заменишь на свой из бота, когда получишь)
    ADSGRAM_BLOCK_ID: "24607", 
    
    // Наше новое название валюты
    CURRENCY_NAME: "WBC",
    
    // Лимит, о котором договаривались: 3 тапа в секунду
    TAPS_PER_SECOND_LIMIT: 3,

    // Настройки энергии и рангов для логики игры
    BASE_TAP_VALUE: 10,
    MAX_ENERGY: 100,
    REGEN_SPEED: 30000 // 30 секунд на 1 единицу
};
