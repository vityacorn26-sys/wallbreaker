const express = require('express');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', true);
const allowedOrigins = [
  'https://vityacorn26-sys.github.io',
  'https://wbapi.corterbs.dpdns.org',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

const db = new Database('database.db');

const {
  getRewardForRank,
  expireRankIfNeeded,
  purchaseRank,
  findPaymentOption
} = require('./services/ranks');

const {
  applyAdReward
} = require('./services/ads');

const {
  bindReferrerIfPossible
} = require('./services/referrals');

const {
  createWithdrawRequest,
  MIN_WITHDRAW_TON
} = require('./services/withdraw');

// ===== SETTINGS =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const MAX_ENERGY = 100;
const ENERGY_REGEN_SEC = 30;
const TAP_DELAY = 150;
const INIT_DATA_MAX_AGE_SEC = 60 * 60 * 6; // 6 hours

const ADS_PER_CLAIM = 1;
const ADS_HOUR_LIMIT = 15;
const ADS_DAY_LIMIT = 48;

const NICKNAME_RENAME_PRICE_WBC = 250000;
const NICKNAME_RENAME_PRICE_STARS = 50;
const NICKNAME_STARS_ENABLED = true;

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN is not set');
  process.exit(1);
}

// ===== RATE LIMIT HELPERS =====
function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cfIp.trim();
  }

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function jsonRateLimit(windowMs, max, message) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    handler: (req, res) => {
      return res.status(429).json({
        error: 'Too many requests',
        message
      });
    }
  });
}

const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getClientIp(req),
  skip: (req) => req.originalUrl.startsWith('/api/tap'),
  handler: (req, res) => {
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Too many API requests from this IP. Try again in a minute.'
    });
  }
});

const userLimiter = jsonRateLimit(
  60 * 1000,
  30,
  'Too many user/profile requests from this IP.'
);

const tapLimiter = jsonRateLimit(
  60 * 1000,
  480,
  'Too many tap requests from this IP.'
);

const adCheckLimiter = jsonRateLimit(
  60 * 60 * 1000,
  120,
  'Too many ad-limit checks from this IP.'
);

const adRewardHourLimiter = jsonRateLimit(
  60 * 60 * 1000,
  30,
  'Too many ad reward claims from this IP this hour.'
);

const adRewardDayLimiter = jsonRateLimit(
  24 * 60 * 60 * 1000,
  80,
  'Too many ad reward claims from this IP today.'
);

const withdrawLimiter = jsonRateLimit(
  60 * 1000,
  5,
  'Too many withdraw requests from this IP.'
);

// ===== DB =====
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    telegramId TEXT PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    balance INTEGER DEFAULT 0,
    wbc_balance INTEGER DEFAULT 0,
    ton_balance REAL DEFAULT 0,
    energy INTEGER DEFAULT 100,
    lastTap INTEGER DEFAULT 0,
    lastEnergyUpdate INTEGER DEFAULT 0,
    ads_day INTEGER DEFAULT 0,
    last_day INTEGER DEFAULT 0,
    ads_hour INTEGER DEFAULT 0,
    last_hour INTEGER DEFAULT 0,
    rank INTEGER DEFAULT 1,
    rank_id INTEGER DEFAULT 1,
    rank_expires_at INTEGER DEFAULT 0,
    lastAdRewardAt INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT 0,
    updatedAt INTEGER DEFAULT 0
  )
`).run();
db.prepare(`
  CREATE TABLE IF NOT EXISTS withdraw_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'TON',
    wallet TEXT,
    status TEXT DEFAULT 'pending',
    createdAt INTEGER DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS monetag_postbacks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ymid TEXT,
    event_type TEXT,
    reward_event_type TEXT,
    zone_id TEXT,
    sub_zone_id TEXT,
    telegram_id TEXT,
    request_var TEXT,
    estimated_price REAL DEFAULT 0,
    raw_query TEXT,
    createdAt INTEGER DEFAULT 0,
    UNIQUE(ymid, event_type)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId TEXT NOT NULL,
    layer INTEGER NOT NULL, -- 1,2,3
    amount INTEGER NOT NULL,
    reward INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active', -- active, finished
    result_type TEXT, -- loss, zero, win20, win40, fragment, key
    startedAt INTEGER,
    endsAt INTEGER,
    lastAdUsedAt INTEGER DEFAULT 0,
    adBoost INTEGER DEFAULT 0
  )
`).run();

// ===== SAFE MIGRATIONS =====
[
  ['first_name', 'TEXT'],
  ['last_name', 'TEXT'],
  ['balance', 'INTEGER DEFAULT 0'],
  ['wbc_balance', 'INTEGER DEFAULT 0'],
  ['ton_balance', 'REAL DEFAULT 0'],
  ['energy', 'INTEGER DEFAULT 100'],
  ['lastTap', 'INTEGER DEFAULT 0'],
  ['lastEnergyUpdate', 'INTEGER DEFAULT 0'],
  ['ads_day', 'INTEGER DEFAULT 0'],
  ['last_day', 'INTEGER DEFAULT 0'],
  ['ads_hour', 'INTEGER DEFAULT 0'],
  ['last_hour', 'INTEGER DEFAULT 0'],
  ['rank', 'INTEGER DEFAULT 1'],
  ['rank_id', 'INTEGER DEFAULT 1'],
  ['rank_expires_at', 'INTEGER DEFAULT 0'],
  ['lastAdRewardAt', 'INTEGER DEFAULT 0'],
  ['createdAt', 'INTEGER DEFAULT 0'],
  ['updatedAt', 'INTEGER DEFAULT 0']
].forEach(([col, type]) => {
  try {
    db.prepare(`ALTER TABLE users ADD COLUMN ${col} ${type}`).run();
  } catch (_) {}
});

[
  ['currency', "TEXT NOT NULL DEFAULT 'TON'"],
  ['wallet', 'TEXT'],
  ['status', "TEXT DEFAULT 'pending'"],
  ['createdAt', 'INTEGER DEFAULT 0']
].forEach(([col, type]) => {
  try {
    db.prepare(`ALTER TABLE withdraw_requests ADD COLUMN ${col} ${type}`).run();
  } catch (_) {}
});

[
  ['reward_claimed', 'INTEGER DEFAULT 0'],
  ['reward_claimed_at', 'INTEGER DEFAULT 0'],
  ['claim_attempts', 'INTEGER DEFAULT 0']
].forEach(([col, type]) => {
  try {
    db.prepare(`ALTER TABLE monetag_postbacks ADD COLUMN ${col} ${type}`).run();
  } catch (_) {}
});


// ===== TASKS / PROMO SAFE MIGRATIONS =====
[
  ['login_streak', 'INTEGER DEFAULT 0'],
  ['last_login_claim_day', 'INTEGER DEFAULT 0'],
  ['public_nickname', 'TEXT'],
  ['nickname_manual', 'INTEGER DEFAULT 0'],
  ['nickname_free_used', 'INTEGER DEFAULT 0'],
  ['nickname_updatedAt', 'INTEGER DEFAULT 0'],
  ['key_fragments', 'INTEGER DEFAULT 0'],
  ['login_streak_cycle', 'INTEGER DEFAULT 0']
].forEach(([col, type]) => {
  try {
    db.prepare(`ALTER TABLE users ADD COLUMN ${col} ${type}`).run();
  } catch (_) {}
});

try {
  db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_public_nickname ON users(public_nickname COLLATE NOCASE)`).run();
} catch (_) {}

db.prepare(`
  CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    reward_ton REAL DEFAULT 0,
    reward_wbc INTEGER DEFAULT 0,
    max_claims INTEGER DEFAULT 0,
    claims_count INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    expires_at INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS promo_code_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_id INTEGER NOT NULL,
    telegramId TEXT NOT NULL,
    claimed_reward_ton REAL DEFAULT 0,
    claimed_reward_wbc INTEGER DEFAULT 0,
    createdAt INTEGER DEFAULT 0,
    UNIQUE(code_id, telegramId)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS daily_task_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId TEXT NOT NULL,
    task_key TEXT NOT NULL,
    claim_day INTEGER NOT NULL,
    createdAt INTEGER DEFAULT 0,
    UNIQUE(telegramId, task_key, claim_day)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS milestone_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId TEXT NOT NULL,
    milestone_key TEXT NOT NULL,
    createdAt INTEGER DEFAULT 0,
    UNIQUE(telegramId, milestone_key)
  )
`).run();

// ===== HELPERS =====
function timingSafeEqualHex(a, b) {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');

    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function verifyTelegramInitData(initData) {
  try {
    if (!initData || typeof initData !== 'string') {
      return { ok: false, error: 'Missing initData' };
    }

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) {
      return { ok: false, error: 'Missing hash' };
    }

    urlParams.delete('hash');

    const dataCheckString = [...urlParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (!timingSafeEqualHex(calculatedHash, hash)) {
      return { ok: false, error: 'Invalid hash' };
    }

    const authDateRaw = urlParams.get('auth_date');
    const authDate = Number(authDateRaw || 0);
    const nowSec = Math.floor(Date.now() / 1000);

    if (!authDate || nowSec - authDate > INIT_DATA_MAX_AGE_SEC) {
      return { ok: false, error: 'initData expired' };
    }

    const userRaw = urlParams.get('user');
    if (!userRaw) {
      return { ok: false, error: 'Missing user' };
    }

    let user;
    try {
      user = JSON.parse(userRaw);
    } catch {
      return { ok: false, error: 'Invalid user JSON' };
    }

    if (!user?.id) {
      return { ok: false, error: 'Missing user.id' };
    }

    return {
      ok: true,
      telegramUser: {
        id: String(user.id),
        username: user.username || '',
        first_name: user.first_name || '',
        last_name: user.last_name || ''
      }
    };
  } catch {
    return { ok: false, error: 'Verification error' };
  }
}

function requireTelegramAuth(req, res, next) {
  const initData = req.body?.initData;
  const result = verifyTelegramInitData(initData);

  if (!result.ok) {
    return res.status(403).json({
      error: 'Invalid Telegram data',
      details: result.error
    });
  }

  req.telegramUser = result.telegramUser;
  next();
}

function regenEnergy(user) {
  const now = Date.now();

  if (!user.lastEnergyUpdate) {
    user.lastEnergyUpdate = now;
    return user;
  }

  const diffSec = Math.floor((now - user.lastEnergyUpdate) / 1000);
  const regen = Math.floor(diffSec / ENERGY_REGEN_SEC);

  if (regen > 0) {
    user.energy = Math.min(MAX_ENERGY, Number(user.energy || 0) + regen);
    user.lastEnergyUpdate += regen * ENERGY_REGEN_SEC * 1000;
  }

  return user;
}

const NICK_FIRST_PARTS = `
Alex Adrian Aiden Arin Axel Blaze Cairo Dante Devin Elias Felix Gage Hugo Ivar Jax Kai Leon Luca Milan Nico Orion Pax Quentin Rafael Roman Theo Viktor Zane
Nexus Cipher Phantom Vertex Quantum Syn Flux Byte Raze Blitz Ripper Slayer Venom Wraith Storm Titan Vortex Surge Pulse Echo Void Glitch Reaper Specter Hacker
Aria Astra Ayla Bella Cora Elara Freya Iris Kaia Kara Luna Lyra Maia Mira Nadia Nika Nova Rhea Talia Vera Yuna Zara Selene Skye Nyra Vika Kira
Morpho Serene Sable Aster Vex Pixel Lux Neon Siren Vesper Vortex Veritas Valkyrie Vida Vena Venus Vela Vale Vox Violet Vixen Void Vigil Viper Vapor
`.trim().split(/\s+/);

const NICK_LAST_PARTS = `
Mercer Novak Volkov Voss Drake Frost Cross Vale Stone Mercer Thorn Vega Orion Blackwood Sterling Ward Kane Ryker Sable Arden Crow Fox Hale Knox Lynch
Morrow North Quinn Reeve Slade Stark Vega Vance Wolfe York Zorin Ashford Calder Dorian Falcon Grayson Hayes Irons Jett Kestrel Locke Maddox Nash Pryce
Chrome Matrix Sentinel Vector Titan Forge Spec Velocity Vanish Volt Vigil Vault Venture Vice Valiant Vex Vigor Virtue Vortex Vesper Void Viper Vigor Vane Valor
Nexus Code Cipher Flux Zone Protocol Daemon Script Kernel Logic Bytes Bits Chip Cache Cycle Engine Flash Grid Hash Heap Link Node Pixel Query Regex Route
`.trim().split(/\s+/);

function generateRefCode() {
  return 'ref_' + crypto.randomBytes(5).toString('hex');
}

function normalizeNickname(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}_. -]/gu, '')
    .trim();
}

function isNicknameValid(value) {
  const nick = normalizeNickname(value);
  return nick.length >= 3 && nick.length <= 24;
}

function nicknameExists(nickname, exceptTelegramId = '') {
  const row = db.prepare(`
    SELECT telegramId
    FROM users
    WHERE LOWER(COALESCE(public_nickname, '')) = LOWER(?)
      AND (? = '' OR telegramId <> ?)
    LIMIT 1
  `).get(
    String(nickname || '').trim(),
    String(exceptTelegramId || ''),
    String(exceptTelegramId || '')
  );

  return Boolean(row);
}

function buildAutoNicknameSeed(telegramId, salt = 0) {
  return crypto
    .createHash('sha256')
    .update(`${telegramId}:${salt}:wallbreaker-nickname`)
    .digest();
}

function buildAutoNickname(telegramId, salt = 0) {
  const seed = buildAutoNicknameSeed(telegramId, salt);
  const first = NICK_FIRST_PARTS[seed[0] % NICK_FIRST_PARTS.length];
  const last = NICK_LAST_PARTS[seed[1] % NICK_LAST_PARTS.length];
  return `${first} ${last}`;
}

function generateUniqueAutoNickname(telegramId) {
  for (let salt = 0; salt < 2048; salt += 1) {
    const base = buildAutoNickname(telegramId, salt);
    if (!nicknameExists(base, telegramId)) {
      return base;
    }

    const seed = buildAutoNicknameSeed(telegramId, salt);
    const suffix = String((((seed[2] << 8) | seed[3]) % 999) + 1);
    const candidate = normalizeNickname(`${base} ${suffix}`);

    if (candidate.length <= 24 && !nicknameExists(candidate, telegramId)) {
      return candidate;
    }
  }

  const fallback = normalizeNickname(`Agent ${String(telegramId).slice(-6)}`);
  if (!nicknameExists(fallback, telegramId)) {
    return fallback;
  }

  for (let i = 1; i <= 9999; i += 1) {
    const candidate = normalizeNickname(`Agent ${String(telegramId).slice(-6)} ${i}`);
    if (candidate.length <= 24 && !nicknameExists(candidate, telegramId)) {
      return candidate;
    }
  }

  return `Agent ${String(telegramId).slice(-6)}`;
}

function ensureUserNickname(user) {
  if (!user) return user;

  const current = normalizeNickname(user.public_nickname || '');
  if (current && current.length >= 3) {
    if (current !== String(user.public_nickname || '')) {
      const now = Date.now();
      db.prepare(`
        UPDATE users
        SET public_nickname = ?,
            nickname_updatedAt = CASE
              WHEN COALESCE(nickname_updatedAt, 0) = 0 THEN ?
              ELSE nickname_updatedAt
            END,
            updatedAt = ?
        WHERE telegramId = ?
      `).run(current, now, now, user.telegramId);

      user.public_nickname = current;
    }

    return user;
  }

  const now = Date.now();
  const generated = generateUniqueAutoNickname(user.telegramId);

  db.prepare(`
    UPDATE users
    SET public_nickname = ?,
        nickname_updatedAt = CASE
          WHEN COALESCE(nickname_updatedAt, 0) = 0 THEN ?
          ELSE nickname_updatedAt
        END,
        updatedAt = ?
    WHERE telegramId = ?
  `).run(generated, now, now, user.telegramId);

  return {
    ...user,
    public_nickname: generated,
    nickname_updatedAt: now
  };
}

function backfillMissingNicknames(limit = 10000) {
  const rows = db.prepare(`
    SELECT telegramId
    FROM users
    WHERE TRIM(COALESCE(public_nickname, '')) = ''
    LIMIT ?
  `).all(limit);

  for (const row of rows) {
    const telegramId = String(row.telegramId);
    const nick = generateUniqueAutoNickname(telegramId);
    const now = Date.now();

    db.prepare(`
      UPDATE users
      SET public_nickname = ?,
          nickname_updatedAt = CASE
            WHEN COALESCE(nickname_updatedAt, 0) = 0 THEN ?
            ELSE nickname_updatedAt
          END,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(nick, now, now, telegramId);
  }
}

function getOrCreateUser(telegramUser) {
  const telegramId = String(telegramUser.id);
  let user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);
  const now = Date.now();
  const generatedRefCode = generateRefCode();
  const generatedNickname = generateUniqueAutoNickname(telegramId);

  if (!user) {
    db.prepare(`
      INSERT INTO users (
        telegramId,
        username,
        first_name,
        last_name,
        public_nickname,
        nickname_manual,
        nickname_free_used,
        nickname_updatedAt,
        balance,
        wbc_balance,
        ton_balance,
        energy,
        lastTap,
        lastEnergyUpdate,
        ads_day,
        last_day,
        ads_hour,
        last_hour,
        rank,
        rank_id,
        rank_expires_at,
        lastAdRewardAt,
        ref_code,
        createdAt,
        updatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      telegramId,
      telegramUser.username || '',
      telegramUser.first_name || '',
      telegramUser.last_name || '',
      generatedNickname,
      0,
      0,
      now,
      0,
      0,
      0,
      MAX_ENERGY,
      0,
      now,
      0,
      Math.floor(now / 86400000),
      0,
      Math.floor(now / 3600000),
      1,
      1,
      0,
      0,
      generatedRefCode,
      now,
      now
    );

    user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);
  } else {
    db.prepare(`
      UPDATE users
      SET username = ?,
          first_name = ?,
          last_name = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(
      telegramUser.username || user.username || '',
      telegramUser.first_name || user.first_name || '',
      telegramUser.last_name || user.last_name || '',
      now,
      telegramId
    );

    user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);
  }

  user = ensureUserNickname(user);
  return user;
}

backfillMissingNicknames();

function addKeyFragments(telegramId, amount, now = Date.now()) {
  const fragments = Math.max(0, Number(amount || 0));
  if (!fragments) return 0;

  db.prepare(`
    UPDATE users
    SET key_fragments = COALESCE(key_fragments, 0) + ?,
        updatedAt = ?
    WHERE telegramId = ?
  `).run(fragments, now, String(telegramId));

  return fragments;
}

function getForgePreview(user) {
  const fragments = Number(user?.key_fragments || 0);
  return {
    key_fragments: fragments,
    forge_ready: fragments >= 10,
    forge_count: Math.floor(fragments / 10),
    forge_remainder: fragments % 10
  };
}

function forgeOneZeroDayKey(telegramId, now = Date.now()) {
  const user = db.prepare(`
    SELECT telegramId, key_fragments, zero_day_keys_balance
    FROM users
    WHERE telegramId = ?
    LIMIT 1
  `).get(String(telegramId));

  if (!user) {
    return { success: false, error: 'user_not_found' };
  }

  const fragments = Number(user.key_fragments || 0);
  if (fragments < 10) {
    return {
      success: false,
      error: 'not_enough_fragments',
      key_fragments: fragments,
      zero_day_keys_balance: Number(user.zero_day_keys_balance || 0),
      forge_ready: false,
      forge_count: 0
    };
  }

  db.prepare(`
    UPDATE users
    SET key_fragments = COALESCE(key_fragments, 0) - 10,
        zero_day_keys_balance = COALESCE(zero_day_keys_balance, 0) + 1,
        updatedAt = ?
    WHERE telegramId = ?
  `).run(now, String(telegramId));

  const fresh = db.prepare(`
    SELECT telegramId, key_fragments, zero_day_keys_balance
    FROM users
    WHERE telegramId = ?
    LIMIT 1
  `).get(String(telegramId));

  return {
    success: true,
    forged_keys: 1,
    key_fragments: Number(fresh?.key_fragments || 0),
    zero_day_keys_balance: Number(fresh?.zero_day_keys_balance || 0),
    forge_ready: Number(fresh?.key_fragments || 0) >= 10,
    forge_count: Math.floor(Number(fresh?.key_fragments || 0) / 10)
  };
}

function refreshAdCounters(user) {
  const now = Date.now();
  const day = Math.floor(now / 86400000);
  const hour = Math.floor(now / 3600000);

  if (user.last_day !== day) {
    db.prepare(`
      UPDATE users
      SET ads_day = 0,
          last_day = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(day, now, user.telegramId);

    user.ads_day = 0;
    user.last_day = day;
  }

  if (user.last_hour !== hour) {
    db.prepare(`
      UPDATE users
      SET ads_hour = 0,
          last_hour = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(hour, now, user.telegramId);

    user.ads_hour = 0;
    user.last_hour = hour;
  }

  return user;
}

function isMonetagValuedReward(value) {
  const v = String(value || '').trim().toLowerCase();
  return (
    v === 'yes' ||
    v === 'valued' ||
    v === 'paid' ||
    v === 'true'
  );
}

function extractTelegramIdFromMonetagYmid(ymid) {
  const cleanYmid = String(ymid || '').trim();
  const match = cleanYmid.match(/^wbad_(\d+)_/);
  return match ? match[1] : '';
}

function isExpectedMonetagYmid(ymid, telegramId) {
  const cleanTelegramId = String(telegramId || '').trim();
  if (!cleanTelegramId) return false;
  return extractTelegramIdFromMonetagYmid(ymid) === cleanTelegramId;
}

function findClickedMonetagPostback(ymid) {
  return db.prepare(`
    SELECT id, ymid, event_type, reward_event_type, reward_claimed, reward_claimed_at, claim_attempts, createdAt
    FROM monetag_postbacks
    WHERE ymid = ?
      AND LOWER(COALESCE(event_type, '')) IN ('click', 'impression')
    ORDER BY createdAt DESC, id DESC
    LIMIT 1
  `).get(String(ymid || '').trim());
}

async function waitForClickedMonetagPostback(ymid, attempts = 20, delayMs = 500) {
  for (let i = 0; i < attempts; i += 1) {
    const row = findClickedMonetagPostback(ymid);
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return null;
}

function ensureRankExpiredReset(user) {
  if (!user) return user;

  const now = Date.now();
  const rankId = Number(user.rank_id || user.rank || 1);
  const expiresAt = Number(user.rank_expires_at || 0);

  if (rankId <= 1) {
    return user;
  }

  if (!expiresAt || expiresAt > now) {
    return user;
  }

  db.prepare(`
    UPDATE users
    SET rank = 1,
        rank_id = 1,
        rank_expires_at = 0,
        updatedAt = ?
    WHERE telegramId = ?
  `).run(now, user.telegramId);

  return {
    ...user,
    rank: 1,
    rank_id: 1,
    rank_expires_at: 0
  };
}

app.use('/api', globalApiLimiter);

app.get('/api/monetag/postback', (req, res) => {
  try {
    const now = Date.now();

    const ymid = String(req.query?.ymid || '').trim();
    const eventType = String(req.query?.event_type || '').trim().toLowerCase();
    const rewardEventType = String(req.query?.reward_event_type || '').trim().toLowerCase();
    const zoneId = String(req.query?.zone_id || '').trim();
    const subZoneId = String(req.query?.sub_zone_id || '').trim();
    const telegramIdFromQuery = String(req.query?.telegram_id || '').trim();
    const telegramIdFromYmid = extractTelegramIdFromMonetagYmid(ymid);
    const telegramId = telegramIdFromQuery || telegramIdFromYmid;
    const requestVar = String(req.query?.request_var || '').trim();
    const estimatedPrice = Number(req.query?.estimated_price || 0);

    console.log('Monetag postback received:', req.query);

    const { event_type, reward_event_type } = req.query;

// ✅ РАЗРЕШАЕМ ТОЛЬКО 1 СОБЫТИЕ = 1 НАГРАДА
    if (event_type !== 'impression') {
      return res.send('ignored');
    }

    const existing = db.prepare(`
      SELECT id, reward_event_type
      FROM monetag_postbacks
      WHERE ymid = ? AND event_type = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(ymid, eventType);

    const estimated = Number.isFinite(estimatedPrice) ? estimatedPrice : 0;
    const rawQuery = JSON.stringify(req.query || {});

    if (existing) {
      const prevRewardType = String(existing.reward_event_type || '').trim().toLowerCase();
      const nextRewardType =
        isMonetagValuedReward(rewardEventType) || !prevRewardType
          ? rewardEventType
          : prevRewardType;

      db.prepare(`
        UPDATE monetag_postbacks
        SET reward_event_type = ?,
            zone_id = ?,
            sub_zone_id = ?,
            telegram_id = ?,
            request_var = ?,
            estimated_price = ?,
            raw_query = ?,
            createdAt = ?
        WHERE id = ?
      `).run(
        nextRewardType,
        zoneId,
        subZoneId,
        telegramId,
        requestVar,
        estimated,
        rawQuery,
        now,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO monetag_postbacks (
          ymid,
          event_type,
          reward_event_type,
          zone_id,
          sub_zone_id,
          telegram_id,
          request_var,
          estimated_price,
          raw_query,
          createdAt,
          reward_claimed,
          reward_claimed_at,
          claim_attempts
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
      `).run(
        ymid,
        eventType,
        rewardEventType,
        zoneId,
        subZoneId,
        telegramId,
        requestVar,
        estimated,
        rawQuery,
        now
      );
    }

    return res.status(200).send('OK');
  } catch (e) {
    console.error('Monetag postback error:', e);
    return res.status(200).send('OK');
  }
});


// ===== USER =====
app.post('/api/user', userLimiter, requireTelegramAuth, (req, res) => {
  const telegramUser = req.telegramUser;
  let user = getOrCreateUser(telegramUser);

  const ref =
    req.body?.ref ||
    req.body?.referrer_id ||
    req.body?.start_param ||
    null;

  if (ref) {
    try {
      const beforeReferrerId = String(user.referrer_id || '').trim();

      bindReferrerIfPossible(db, String(user.telegramId), String(ref));

      user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(String(user.telegramId));

      const afterReferrerId = String(user?.referrer_id || '').trim();

      if (!beforeReferrerId && afterReferrerId && afterReferrerId !== String(user.telegramId)) {
        db.prepare(`
          UPDATE users
          SET referrals_total = COALESCE(referrals_total, 0) + 1
          WHERE telegramId = ?
        `).run(afterReferrerId);

        try {
          const drawId = ensureActiveDrawId(db);
          const stats = ensureDrawUserStats(db, drawId, afterReferrerId);
          if (stats) {
            db.prepare(`
              UPDATE draw_user_stats
              SET refs_round = COALESCE(refs_round, 0) + 1,
                  updatedAt = ?
              WHERE draw_id = ? AND telegramId = ?
            `).run(Date.now(), drawId, afterReferrerId);
          }
        } catch (e) {
          console.error('round refs update error:', e);
        }
      }
    } catch (_) {}
  }
  user = regenEnergy(user);
  user = refreshAdCounters(user);
  user = ensureRankExpiredReset(expireRankIfNeeded(db, user).user);

  db.prepare(`
    UPDATE users
    SET energy = ?,
        lastEnergyUpdate = ?,
        updatedAt = ?
    WHERE telegramId = ?
  `).run(
    user.energy,
    user.lastEnergyUpdate,
    Date.now(),
    user.telegramId
  );

  const canWatchAds =
    (Number(user.ads_day || 0) + ADS_PER_CLAIM) <= ADS_DAY_LIMIT &&
    (Number(user.ads_hour || 0) + ADS_PER_CLAIM) <= ADS_HOUR_LIMIT;

  const lastWithdraw = db.prepare(`
    SELECT id, amount, currency, wallet, status, createdAt
    FROM withdraw_requests
    WHERE telegramId = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(user.telegramId);

  const freshUser = db.prepare(`
    SELECT telegramId,
           username,
           ref_code,
           first_name,
           last_name,
           public_nickname,
           nickname_manual,
           nickname_free_used,
           key_fragments,
           balance,
           wbc_balance,
           ton_balance,
           energy,
           rank,
           rank_id,
           rank_expires_at,
           ads_day,
           ads_hour,
           lastAdRewardAt
    FROM users
    WHERE telegramId = ?
  `).get(user.telegramId);

  return res.json({
    telegramId: freshUser.telegramId,
    username: freshUser.username,
    ref_code: freshUser.ref_code || "",
    first_name: freshUser.first_name,
    last_name: freshUser.last_name,
    public_nickname: freshUser.public_nickname || "",
    nickname_manual: Number(freshUser.nickname_manual || 0),
    nickname_free_used: Number(freshUser.nickname_free_used || 0),
    key_fragments: Number(freshUser.key_fragments || 0),
    forge_ready: Number(freshUser.key_fragments || 0) >= 10,
    forge_count: Math.floor(Number(freshUser.key_fragments || 0) / 10),
    nickname_price_wbc: NICKNAME_RENAME_PRICE_WBC,
    nickname_price_stars: NICKNAME_RENAME_PRICE_STARS,
    nickname_stars_enabled: NICKNAME_STARS_ENABLED ? 1 : 0,
    balance: Number(freshUser.wbc_balance || freshUser.balance || 0),
    wbc_balance: Number(freshUser.wbc_balance || 0),
    ton_balance: Number(freshUser.ton_balance || 0),
    energy: Number(freshUser.energy || 0),
    rank: Number(freshUser.rank || freshUser.rank_id || 1),
    rank_id: Number(freshUser.rank_id || 1),
    rank_expires_at: Number(freshUser.rank_expires_at || 0),
    adsDay: Number(freshUser.ads_day || 0),
    adsHour: Number(freshUser.ads_hour || 0),
    canWatchAds,
    walletConnected: false,
    withdrawStatus: lastWithdraw ? lastWithdraw.status : 'none',
    lastWithdraw: lastWithdraw || null
  });
});

app.post('/api/profile/nickname/set', requireTelegramAuth, (req, res) => {
  try {
    const telegramUser = req.telegramUser;
    const telegramId = String(telegramUser.id);
    const requested = normalizeNickname(req.body?.nickname || '');
    const requestedMode = String(req.body?.mode || '').trim().toLowerCase();

    let user = getOrCreateUser(telegramUser);
    user = ensureUserNickname(user);

    if (!isNicknameValid(requested)) {
      return res.status(400).json({ success: false, error: 'nickname_invalid' });
    }

    if (nicknameExists(requested, telegramId)) {
      return res.status(400).json({ success: false, error: 'nickname_taken' });
    }

    const currentNickname = normalizeNickname(user.public_nickname || '');
    if (requested === currentNickname) {
      return res.status(400).json({
        success: false,
        error: 'nickname_same',
        public_nickname: currentNickname,
        nickname_manual: Number(user.nickname_manual || 0),
        nickname_free_used: Number(user.nickname_free_used || 0),
        balance: Number(user.wbc_balance || user.balance || 0),
        ton_balance: Number(user.ton_balance || 0)
      });
    }

    let mode = 'free';
    let priceWbc = 0;
    let nextWbcBalance = Number(user.wbc_balance || 0);
    const freeUsedAlready = Number(user.nickname_free_used || 0) === 1;

    if (freeUsedAlready) {
      if (requestedMode === 'stars') {
        if (!NICKNAME_STARS_ENABLED) {
          return res.status(400).json({ success: false, error: 'nickname_stars_later' });
        }

        return res.status(400).json({ success: false, error: 'nickname_stars_later' });
      }

      mode = 'wbc';
      priceWbc = NICKNAME_RENAME_PRICE_WBC;

      if (nextWbcBalance < priceWbc) {
        return res.status(400).json({ success: false, error: 'nickname_no_wbc' });
      }

      nextWbcBalance -= priceWbc;
    }

    const now = Date.now();

    db.prepare(`
      UPDATE users
      SET public_nickname = ?,
          nickname_manual = 1,
          nickname_free_used = 1,
          nickname_updatedAt = ?,
          wbc_balance = ?,
          balance = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(
      requested,
      now,
      nextWbcBalance,
      nextWbcBalance,
      now,
      telegramId
    );

    return res.json({
      success: true,
      public_nickname: requested,
      nickname_manual: 1,
      nickname_free_used: 1,
      mode,
      price_wbc: priceWbc,
      wbc_balance: nextWbcBalance,
      balance: nextWbcBalance
    });
  } catch (e) {
    console.error('nickname set error:', e);
    return res.status(500).json({ success: false, error: 'nickname_set_failed' });
  }
});

app.post('/api/key/forge', requireTelegramAuth, (req, res) => {
  try {
    const telegramId =
      req.telegramUser?.id
        ? String(req.telegramUser.id)
        : String(req.body?.telegramId || '');

    if (!telegramId) {
      return res.json({ success: false, error: 'missing_telegram_id' });
    }

    const result = forgeOneZeroDayKey(telegramId, Date.now());

    if (!result?.success) {
      if (result?.error === 'user_not_found') {
        return res.status(404).json(result);
      }
      if (result?.error === 'not_enough_fragments') {
        return res.status(400).json(result);
      }
      return res.status(400).json(result || { success: false, error: 'key_forge_failed' });
    }

    return res.json(result);
  } catch (e) {
    console.error('key forge error:', e);
    return res.status(500).json({ success: false, error: 'key_forge_failed' });
  }
});

// ===== PROMO / TASKS HELPERS =====
function getDayNumber(ts = Date.now()) {
  return Math.floor(Number(ts || Date.now()) / 86400000);
}

function getStreakRewardWbc(nextDay) {
  const day = Number(nextDay || 1);
  if (day <= 1) return 1000;
  if (day === 2) return 2000;
  if (day >= 7) return 5000;
  return 3000;
}

function getLoginStreakPreview(user) {
  const today = getDayNumber();
  const lastClaimDay = Number(user?.last_login_claim_day || 0);
  const currentStreak = Number(user?.login_streak || 0);
  const currentCycle = Number(user?.login_streak_cycle || 0);
  const shownStreak = Math.min(Math.max(currentStreak || 1, 1), 7);

  if (lastClaimDay === today) {
    return {
      today,
      alreadyClaimed: true,
      nextStreak: shownStreak,
      rewardWbc: getStreakRewardWbc(shownStreak),
      rewardFragments: 0,
      nextCycle: currentCycle
    };
  }

  const isConsecutive = lastClaimDay === today - 1;
  const nextStreak = isConsecutive
    ? Math.min(currentStreak + 1, 7)
    : 1;

  let nextCycle = 0;
  let rewardFragments = 0;

  if (isConsecutive && currentStreak >= 7) {
    nextCycle = currentCycle + 1;
    if (nextCycle >= 7) {
      rewardFragments = 1;
      nextCycle = 0;
    }
  }

  return {
    today,
    alreadyClaimed: false,
    nextStreak,
    rewardWbc: getStreakRewardWbc(nextStreak),
    rewardFragments,
    nextCycle
  };
}

function getValidReferralCount(telegramId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM users
    WHERE referrer_id = ?
      AND COALESCE(ads_total, 0) >= 10
      AND COALESCE(wbc_balance, 0) >= 10000
  `).get(String(telegramId));

  return Number(row?.cnt || 0);
}

function hasClaimedDailyTask(telegramId, taskKey, claimDay) {
  const row = db.prepare(`
    SELECT id
    FROM daily_task_claims
    WHERE telegramId = ?
      AND task_key = ?
      AND claim_day = ?
    LIMIT 1
  `).get(String(telegramId), String(taskKey), Number(claimDay));

  return Boolean(row?.id);
}

function hasClaimedMilestone(telegramId, milestoneKey) {
  const row = db.prepare(`
    SELECT id
    FROM milestone_claims
    WHERE telegramId = ?
      AND milestone_key = ?
    LIMIT 1
  `).get(String(telegramId), String(milestoneKey));

  return Boolean(row?.id);
}

function getCurrentRoundRefProgress(telegramId) {
  const drawId = ensureActiveDrawId(db);
  const stats = ensureDrawUserStats(db, drawId, String(telegramId));
  return {
    drawId,
    refsRound: Number(stats?.refs_round || 0)
  };
}

function getRoundMilestoneKey(taskKey, drawId) {
  return `${String(taskKey)}__draw_${Number(drawId || 0)}`;
}

function getTaskStatusPayload(user) {
  const safeUser = refreshAdCounters(regenEnergy(user));
  const today = getDayNumber();
  const adsToday = Number(safeUser.ads_day || 0);
  const roundRef = getCurrentRoundRefProgress(safeUser.telegramId);
  const refsRound = Number(roundRef.refsRound || 0);
  const streak = getLoginStreakPreview(safeUser);

  const ref1MilestoneKey = getRoundMilestoneKey('ref_valid_1', roundRef.drawId);
  const ref5MilestoneKey = getRoundMilestoneKey('ref_valid_5', roundRef.drawId);

  return {
    success: true,
    ads_today: adsToday,
    refs_valid: refsRound,
    login_streak_current: Number(safeUser.login_streak || 0),
    login_streak_next: Number(streak.nextStreak || 1),
    login_streak_reward_wbc: Number(streak.rewardWbc || 0),
    login_streak_reward_fragments: Number(streak.rewardFragments || 0),
    tasks: {
      ads_10_daily: {
        key: 'ads_10_daily',
        progress: Math.min(adsToday, 10),
        target: 10,
        reward_wbc: 10000,
        claimable: adsToday >= 10 && !hasClaimedDailyTask(safeUser.telegramId, 'ads_10_daily', today),
        claimed: hasClaimedDailyTask(safeUser.telegramId, 'ads_10_daily', today)
      },
      ads_15_daily: {
        key: 'ads_15_daily',
        progress: Math.min(adsToday, 15),
        target: 15,
        reward_wbc: 10000,
        claimable: adsToday >= 15 && !hasClaimedDailyTask(safeUser.telegramId, 'ads_15_daily', today),
        claimed: hasClaimedDailyTask(safeUser.telegramId, 'ads_15_daily', today)
      },
      ads_20_daily: {
        key: 'ads_20_daily',
        progress: Math.min(adsToday, 20),
        target: 20,
        reward_wbc: 10000,
        claimable: adsToday >= 20 && !hasClaimedDailyTask(safeUser.telegramId, 'ads_20_daily', today),
        claimed: hasClaimedDailyTask(safeUser.telegramId, 'ads_20_daily', today)
      },
      login_streak_daily: {
        key: 'login_streak_daily',
        progress: Number(streak.nextStreak || 1),
        target: 7,
        reward_wbc: Number(streak.rewardWbc || 0),
        reward_fragments_bonus: Number(streak.rewardFragments || 0),
        claimable: !streak.alreadyClaimed,
        claimed: Boolean(streak.alreadyClaimed)
      },
      ref_valid_1: {
        key: 'ref_valid_1',
        progress: Math.min(refsRound, 1),
        target: 1,
        reward_wbc: 20000,
        claimable: refsRound >= 1 && !hasClaimedMilestone(safeUser.telegramId, ref1MilestoneKey),
        claimed: hasClaimedMilestone(safeUser.telegramId, ref1MilestoneKey)
      },
      ref_valid_5: {
        key: 'ref_valid_5',
        progress: Math.min(refsRound, 5),
        target: 5,
        reward_fragments: 3,
        claimable: refsRound >= 5 && !hasClaimedMilestone(safeUser.telegramId, ref5MilestoneKey),
        claimed: hasClaimedMilestone(safeUser.telegramId, ref5MilestoneKey)
      }
    }
  };
}

// ===== PROMO =====
app.post('/api/promo/redeem', requireTelegramAuth, (req, res) => {
  try {
    const telegramId = String(req.telegramUser.id);
    const rawCode = String(req.body?.code || '').trim().toUpperCase();

    if (!rawCode) {
      return res.status(400).json({ success: false, error: 'invalid_code' });
    }

    const promo = db.prepare(`
      SELECT *
      FROM promo_codes
      WHERE code = ?
      LIMIT 1
    `).get(rawCode);

    if (!promo || Number(promo.active || 0) !== 1) {
      return res.status(404).json({ success: false, error: 'promo_not_found' });
    }

    const now = Date.now();
    if (Number(promo.expires_at || 0) > 0 && Number(promo.expires_at) < now) {
      return res.status(400).json({ success: false, error: 'promo_expired' });
    }

    if (Number(promo.max_claims || 0) > 0 && Number(promo.claims_count || 0) >= Number(promo.max_claims || 0)) {
      return res.status(400).json({ success: false, error: 'promo_limit_reached' });
    }

    const already = db.prepare(`
      SELECT id
      FROM promo_code_claims
      WHERE code_id = ?
        AND telegramId = ?
      LIMIT 1
    `).get(promo.id, telegramId);

    if (already?.id) {
      return res.status(400).json({ success: false, error: 'promo_already_claimed' });
    }

    const user = db.prepare(`SELECT * FROM users WHERE telegramId = ? LIMIT 1`).get(telegramId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' });
    }

    const rewardTon = Number(promo.reward_ton || 0);
    const rewardWbc = Number(promo.reward_wbc || 0);

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO promo_code_claims (
          code_id,
          telegramId,
          claimed_reward_ton,
          claimed_reward_wbc,
          createdAt
        )
        VALUES (?, ?, ?, ?, ?)
      `).run(promo.id, telegramId, rewardTon, rewardWbc, now);

      db.prepare(`
        UPDATE promo_codes
        SET claims_count = COALESCE(claims_count, 0) + 1
        WHERE id = ?
      `).run(promo.id);

      db.prepare(`
        UPDATE users
        SET ton_balance = COALESCE(ton_balance, 0) + ?,
            wbc_balance = COALESCE(wbc_balance, 0) + ?,
            balance = COALESCE(wbc_balance, balance, 0) + ?,
            updatedAt = ?
        WHERE telegramId = ?
      `).run(rewardTon, rewardWbc, rewardWbc, now, telegramId);
    });

    tx();

    const fresh = db.prepare(`
      SELECT ton_balance, wbc_balance, balance
      FROM users
      WHERE telegramId = ?
      LIMIT 1
    `).get(telegramId);

    return res.json({
      success: true,
      code: rawCode,
      reward_ton: rewardTon,
      reward_wbc: rewardWbc,
      ton_balance: Number(fresh?.ton_balance || 0),
      wbc_balance: Number(fresh?.wbc_balance || 0),
      balance: Number(fresh?.wbc_balance || fresh?.balance || 0)
    });
  } catch (e) {
    console.error('promo redeem error:', e);
    return res.status(500).json({ success: false, error: 'promo_redeem_failed' });
  }
});

// ===== TASKS STATUS =====
app.post('/api/tasks/status', requireTelegramAuth, (req, res) => {
  try {
    const telegramId = String(req.telegramUser.id);
    const user = db.prepare(`SELECT * FROM users WHERE telegramId = ? LIMIT 1`).get(telegramId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' });
    }

    return res.json(getTaskStatusPayload(user));
  } catch (e) {
    console.error('tasks status error:', e);
    return res.status(500).json({ success: false, error: 'tasks_status_failed' });
  }
});

// ===== TASKS CLAIM =====
app.post('/api/tasks/claim', requireTelegramAuth, (req, res) => {
  try {
    const telegramId = String(req.telegramUser.id);
    const taskKey = String(req.body?.task_key || '').trim();

    if (!taskKey) {
      return res.status(400).json({ success: false, error: 'invalid_task_key' });
    }

    const user = db.prepare(`SELECT * FROM users WHERE telegramId = ? LIMIT 1`).get(telegramId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' });
    }

    const safeUser = refreshAdCounters(regenEnergy(user));
    const now = Date.now();
    const today = getDayNumber();
    let rewardWbc = 0;
    let rewardTon = 0;
    let rewardKeys = 0;
    let rewardFragments = 0;

    const tx = db.transaction(() => {
      if (taskKey === 'ads_10_daily' || taskKey === 'ads_15_daily' || taskKey === 'ads_20_daily') {
        const target = taskKey === 'ads_10_daily' ? 10 : taskKey === 'ads_15_daily' ? 15 : 20;
        if (Number(safeUser.ads_day || 0) < target) {
          throw new Error('task_not_ready');
        }
        if (hasClaimedDailyTask(telegramId, taskKey, today)) {
          throw new Error('task_already_claimed');
        }

        rewardWbc = 10000;

        db.prepare(`
          INSERT INTO daily_task_claims (telegramId, task_key, claim_day, createdAt)
          VALUES (?, ?, ?, ?)
        `).run(telegramId, taskKey, today, now);

        db.prepare(`
          UPDATE users
          SET wbc_balance = COALESCE(wbc_balance, 0) + ?,
              balance = COALESCE(wbc_balance, balance, 0) + ?,
              updatedAt = ?
          WHERE telegramId = ?
        `).run(rewardWbc, rewardWbc, now, telegramId);

        return;
      }

      if (taskKey === 'login_streak_daily') {
        const streak = getLoginStreakPreview(safeUser);
        if (streak.alreadyClaimed) {
          throw new Error('task_already_claimed');
        }

        rewardWbc = Number(streak.rewardWbc || 0);
        rewardFragments = Number(streak.rewardFragments || 0);

        db.prepare(`
          UPDATE users
          SET login_streak = ?,
              login_streak_cycle = ?,
              last_login_claim_day = ?,
              wbc_balance = COALESCE(wbc_balance, 0) + ?,
              balance = COALESCE(wbc_balance, balance, 0) + ?,
              key_fragments = COALESCE(key_fragments, 0) + ?,
              updatedAt = ?
          WHERE telegramId = ?
        `).run(
          Number(streak.nextStreak || 1),
          Number(streak.nextCycle || 0),
          today,
          rewardWbc,
          rewardWbc,
          rewardFragments,
          now,
          telegramId
        );

        return;
      }

      if (taskKey === 'ref_valid_1' || taskKey === 'ref_valid_5') {
        const need = taskKey === 'ref_valid_1' ? 1 : 5;
        const roundRef = getCurrentRoundRefProgress(telegramId);
        const refsRound = Number(roundRef.refsRound || 0);
        const roundMilestoneKey = getRoundMilestoneKey(taskKey, roundRef.drawId);

        if (refsRound < need) {
          throw new Error('task_not_ready');
        }
        if (hasClaimedMilestone(telegramId, roundMilestoneKey)) {
          throw new Error('task_already_claimed');
        }

        db.prepare(`
          INSERT INTO milestone_claims (telegramId, milestone_key, createdAt)
          VALUES (?, ?, ?)
        `).run(telegramId, roundMilestoneKey, now);

        if (taskKey === 'ref_valid_1') {
          rewardWbc = 20000;

          db.prepare(`
            UPDATE users
            SET wbc_balance = COALESCE(wbc_balance, 0) + ?,
                balance = COALESCE(wbc_balance, balance, 0) + ?,
                updatedAt = ?
            WHERE telegramId = ?
          `).run(rewardWbc, rewardWbc, now, telegramId);
        }

        if (taskKey === 'ref_valid_5') {
          rewardWbc = 20000;
          rewardFragments = 3;

          db.prepare(`
            UPDATE users
            SET wbc_balance = COALESCE(wbc_balance, 0) + ?,
                balance = COALESCE(wbc_balance, balance, 0) + ?,
                key_fragments = COALESCE(key_fragments, 0) + ?,
                updatedAt = ?
            WHERE telegramId = ?
          `).run(rewardWbc, rewardWbc, rewardFragments, now, telegramId);
        }

        return;
      }

      throw new Error('task_unknown');
    });

    try {
      tx();
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg === 'task_not_ready') {
        return res.status(400).json({ success: false, error: 'task_not_ready' });
      }
      if (msg === 'task_already_claimed') {
        return res.status(400).json({ success: false, error: 'task_already_claimed' });
      }
      if (msg === 'task_unknown') {
        return res.status(400).json({ success: false, error: 'task_unknown' });
      }
      throw err;
    }

    const fresh = db.prepare(`
      SELECT telegramId, balance, wbc_balance, ton_balance, zero_day_keys_balance, key_fragments, login_streak, last_login_claim_day
      FROM users
      WHERE telegramId = ?
      LIMIT 1
    `).get(telegramId);

    return res.json({
      success: true,
      task_key: taskKey,
      reward_wbc: rewardWbc,
      reward_ton: rewardTon,
      reward_keys: rewardKeys,
      reward_fragments: rewardFragments,
      balance: Number(fresh?.wbc_balance || fresh?.balance || 0),
      wbc_balance: Number(fresh?.wbc_balance || 0),
      ton_balance: Number(fresh?.ton_balance || 0),
      zero_day_keys_balance: Number(fresh?.zero_day_keys_balance || 0),
      key_fragments: Number(fresh?.key_fragments || 0),
      forge_ready: Number(fresh?.key_fragments || 0) >= 10,
      forge_count: Math.floor(Number(fresh?.key_fragments || 0) / 10),
      login_streak: Number(fresh?.login_streak || 0),
      last_login_claim_day: Number(fresh?.last_login_claim_day || 0)
    });
  } catch (e) {
    console.error('tasks claim error:', e);
    return res.status(500).json({ success: false, error: 'tasks_claim_failed' });
  }
});


// ===== WITHDRAW =====
app.post('/api/withdraw/request', withdrawLimiter, requireTelegramAuth, (req, res) => {
  try {
    const telegramId = req.telegramUser.id;
    const amountTon = Number(req.body?.amount);
    const wallet = String(req.body?.wallet || '').trim();

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE telegramId = ?
    `).get(telegramId);

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'no_user'
      });
    }

    const result = createWithdrawRequest(db, user, amountTon, wallet);

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        error: result.error,
        min: result.min || MIN_WITHDRAW_TON
      });
    }

    const freshUser = db.prepare(`
      SELECT telegramId, username, balance, wbc_balance, ton_balance, rank, rank_id, rank_expires_at
      FROM users
      WHERE telegramId = ?
    `).get(telegramId);

    return res.json({
      success: true,
      requestId: result.requestId,
      amount: result.amount,
      wallet: result.wallet,
      currency: 'TON',
      ton_balance: Number(freshUser.ton_balance || 0)
    });
  } catch (e) {
    console.error('withdraw request failed:', e);
    return res.status(500).json({
      success: false,
      error: 'withdraw_failed'
    });
  }
});

app.post('/api/withdraw/status', requireTelegramAuth, (req, res) => {
  const telegramId = req.telegramUser.id;

  const row = db.prepare(`
    SELECT id, telegramId, amount, currency, wallet, status, createdAt
    FROM withdraw_requests
    WHERE telegramId = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(telegramId);

  return res.json({
    success: true,
    request: row || null
  });
});
// ===== TAP =====
app.post('/api/tap', tapLimiter, requireTelegramAuth, (req, res) => {
  const telegramId = req.telegramUser.id;
  let user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);

  if (!user) {
    return res.status(400).json({ error: 'No user' });
  }

  if (Date.now() - Number(user.lastTap || 0) < TAP_DELAY) {
    return res.status(429).json({ error: 'Too fast' });
  }

  user = regenEnergy(user);
  user = ensureRankExpiredReset(expireRankIfNeeded(db, user).user);

  if (Number(user.energy || 0) <= 0) {
    db.prepare(`
      UPDATE users
      SET energy = ?,
          lastEnergyUpdate = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(
      user.energy,
      user.lastEnergyUpdate,
      Date.now(),
      telegramId
    );

    return res.status(400).json({ error: 'No energy' });
  }

  const reward = getRewardForRank(user.rank_id);
  const newBalance = Number(user.wbc_balance || 0) + reward;
  const newEnergy = Number(user.energy || 0) - 1;
  const now = Date.now();

  db.prepare(`
    UPDATE users
    SET balance = ?,
        wbc_balance = ?,
        energy = ?,
        lastTap = ?,
        lastEnergyUpdate = ?,
        updatedAt = ?,
        taps_total = COALESCE(taps_total, 0) + 1
    WHERE telegramId = ?
  `).run(
    newBalance,
    newBalance,
    newEnergy,
    now,
    user.lastEnergyUpdate,
    now,
    telegramId
  );

  // round taps update
  try {
    const drawId = ensureActiveDrawId(db);
    const stats = ensureDrawUserStats(db, drawId, telegramId);
    if (stats) {
      db.prepare(`
        UPDATE draw_user_stats
        SET taps_round = COALESCE(taps_round, 0) + 1,
            updatedAt = ?
        WHERE draw_id = ? AND telegramId = ?
      `).run(Date.now(), drawId, telegramId);
    }
  } catch (e) {
    console.error('round taps update error:', e);
  }

  recalcDrawScore(db, telegramId);

  return res.json({
    balance: newBalance,
    wbc_balance: newBalance,
    ton_balance: Number(user.ton_balance || 0),
    energy: newEnergy,
    rank_id: Number(user.rank_id || 1),
    rank_expires_at: Number(user.rank_expires_at || 0),
    reward
  });
});

app.post('/api/contract/start', requireTelegramAuth, (req, res) => {
  try {
    const { layer, amount } = req.body;
    const telegramId = String(req.user.telegramId);

    if (![1,2,3].includes(layer)) {
      return res.status(400).json({ error: 'invalid_layer' });
    }

    const now = Date.now();

    const layerConfig = {
      1: { min: 20000, max: 40000, duration: 16 },
      2: { min: 50000, max: 150000, duration: 28 },
      3: { min: 160000, max: 300000, duration: 42 }
    };

    const cfg = layerConfig[layer];

    if (amount < cfg.min || amount > cfg.max) {
      return res.status(400).json({ error: 'invalid_amount' });
    }

    const active = db.prepare(`
      SELECT COUNT(*) as cnt FROM contracts
      WHERE telegramId=? AND status='active'
    `).get(telegramId);

    if (active.cnt >= 2) {
      return res.status(400).json({ error: 'too_many_active' });
    }

    const user = db.prepare(`
      SELECT wbc_balance FROM users WHERE telegramId=?
    `).get(telegramId);

    if (!user || user.wbc_balance < amount) {
      return res.status(400).json({ error: 'not_enough_wbc' });
    }

    // списываем WBC
    db.prepare(`
      UPDATE users
      SET wbc_balance = wbc_balance - ?,
          balance = balance - ?
      WHERE telegramId=?
    `).run(amount, amount, telegramId);

    const endsAt = now + cfg.duration * 3600 * 1000;

    db.prepare(`
      INSERT INTO contracts (
        telegramId, layer, amount, startedAt, endsAt
      ) VALUES (?, ?, ?, ?, ?)
    `).run(telegramId, layer, amount, now, endsAt);

    return res.json({ success: true, endsAt });

  } catch (e) {
    console.error('contract start error', e);
    return res.status(500).json({ error: 'contract_start_failed' });
  }
});

app.post('/api/contract/status', requireTelegramAuth, (req, res) => {
  try {
    const telegramId = String(req.user.telegramId);

    const now = Date.now();

    const contracts = db.prepare(`
      SELECT *
      FROM contracts
      WHERE telegramId=?
      ORDER BY id DESC
    `).all(telegramId);

    const mapped = contracts.map(c => {
      const remaining = Math.max(0, c.endsAt - now);
      return {
        ...c,
        isReady: remaining === 0,
        remainingMs: remaining
      };
    });

    return res.json({ success: true, contracts: mapped });

  } catch (e) {
    console.error('contract status error', e);
    return res.status(500).json({ error: 'contract_status_failed' });
  }
});

app.post('/api/contract/finish', requireTelegramAuth, (req, res) => {
  try {
    const { contractId } = req.body;
    const telegramId = String(req.user.telegramId);
    const now = Date.now();

    const contract = db.prepare(`
      SELECT * FROM contracts
      WHERE id=? AND telegramId=?
    `).get(contractId, telegramId);

    if (!contract) {
      return res.status(404).json({ error: 'not_found' });
    }

    if (contract.status !== 'active') {
      return res.status(400).json({ error: 'already_finished' });
    }

    if (now < contract.endsAt) {
      return res.status(400).json({ error: 'not_ready' });
    }

    // ===== ШАНСЫ =====
    const roll = Math.random() * 100;

    let resultType = 'zero';
    let reward = 0;

    if (contract.layer === 1) {
      if (roll < 14) {
        resultType = 'loss';
        reward = Math.floor(contract.amount * 0.8);
      } else if (roll < 44) {
        resultType = 'zero';
        reward = contract.amount;
      } else if (roll < 84) {
        resultType = 'win20';
        reward = Math.floor(contract.amount * 1.2);
      } else if (roll < 99) {
        resultType = 'win40';
        reward = Math.floor(contract.amount * 1.4);
      } else if (roll < 99.99) {
        resultType = 'fragment';
      } else {
        resultType = 'key';
      }
    }

    // L2 и L3 добавим дальше (не мешаем сейчас — проверим L1)

    // ===== ВЫПЛАТА =====
    if (resultType === 'fragment') {
      db.prepare(`
        UPDATE users
        SET key_fragments = COALESCE(key_fragments,0) + 1
        WHERE telegramId=?
      `).run(telegramId);
    } else if (resultType === 'key') {
      db.prepare(`
        UPDATE users
        SET zero_day_keys_balance = COALESCE(zero_day_keys_balance,0) + 1
        WHERE telegramId=?
      `).run(telegramId);
    } else {
      db.prepare(`
        UPDATE users
        SET wbc_balance = wbc_balance + ?,
            balance = balance + ?
        WHERE telegramId=?
      `).run(reward, reward, telegramId);
    }

    db.prepare(`
      UPDATE contracts
      SET status='finished',
          reward=?,
          result_type=?
      WHERE id=?
    `).run(reward, resultType, contractId);

    return res.json({
      success: true,
      resultType,
      reward
    });

  } catch (e) {
    console.error('contract finish error', e);
    return res.status(500).json({ error: 'contract_finish_failed' });
  }
});

// ===== AD LIMIT =====
app.post('/api/ad-limit', adCheckLimiter, requireTelegramAuth, (req, res) => {
  const telegramId = req.telegramUser.id;
  let user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);

  if (!user) {
    return res.json({ canWatch: false });
  }

  user = refreshAdCounters(user);

  const canWatch =
    (Number(user.ads_day || 0) + ADS_PER_CLAIM) <= ADS_DAY_LIMIT &&
    (Number(user.ads_hour || 0) + ADS_PER_CLAIM) <= ADS_HOUR_LIMIT;

  return res.json({
    canWatch,
    adsDay: Number(user.ads_day || 0),
    adsHour: Number(user.ads_hour || 0)
  });
});

// ===== AD REWARD =====
app.post(
  '/api/ad-reward',
  adRewardHourLimiter,
  adRewardDayLimiter,
  requireTelegramAuth,
  async (req, res) => {

    const ymid = String(req.body?.ymid || '').trim();
    const telegramId = String(req.telegramUser?.id || '');


    if (!ymid) {
      return res.json({ success: false, error: 'missing_ymid' });
    }

    if (req.body?.event_type && req.body.event_type !== 'reward') {
      return res.json({ success: true, skipped: true });
    }

    if (!isExpectedMonetagYmid(ymid, telegramId)) {
      return res.json({ success: false, error: 'invalid_ymid' });
    }

    const postback = db.prepare(`
      SELECT *
      FROM monetag_postbacks
      WHERE ymid = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(ymid);

    if (!postback) {
      return res.json({ success: false, error: 'ad_not_found' });
    }

    const isValid =
      postback.event_type === 'impression';

    if (!isValid) {
      return res.json({ success: false, error: 'ad_not_completed' });
    }


    let user = db.prepare('SELECT * FROM users WHERE telegramId = ?').get(telegramId);

    if (!user) {
      return res.json({ success: false, error: 'no_user' });
    }

    const claimMark = db.prepare(`
      UPDATE monetag_postbacks
      SET reward_claimed = 1,
          reward_claimed_at = ?,
          claim_attempts = COALESCE(claim_attempts, 0) + 1
      WHERE ymid = ?
        AND LOWER(COALESCE(event_type, '')) = 'impression'
        AND COALESCE(reward_claimed, 0) = 0
    `).run(Date.now(), ymid);

    if (!claimMark.changes) {
      return res.json({ success: false, error: 'ad_already_claimed' });
    }

    user = refreshAdCounters(user);
    user = ensureRankExpiredReset(expireRankIfNeeded(db, user).user);

    const beforeAdsDay = Number(user.ads_day || 0);
    const beforeAdsHour = Number(user.ads_hour || 0);
    const beforeAdsTotal = Number(user.ads_total || 0);

    const result = applyAdReward(db, user, {
      provider: 'monetag',
      rewardWbc: 1500
    });

    const refReward = result?.rewardWbc || 1500;

    const ref1 = user.referrer_telegram_id;

    if (ref1) {

      const ref2 = db.prepare(`
        SELECT referrer_telegram_id FROM users WHERE telegramId = ?
      `).get(ref1)?.referrer_telegram_id;

      const ref3 = ref2
        ? db.prepare(`SELECT referrer_telegram_id FROM users WHERE telegramId = ?`).get(ref2)?.referrer_telegram_id
        : null;

      const pay = (id, percent) => {
        if (!id) return;
        const amount = Math.floor(refReward * percent);

        db.prepare(`
          UPDATE users
          SET wbc_balance = COALESCE(wbc_balance, 0) + ?
          WHERE telegramId = ?
        `).run(amount, id);
      };

      pay(ref1, 0.10);
      pay(ref2, 0.05);
      pay(ref3, 0.03);
    }

    const updatedUser = result.user || user;

    const alreadyActivated = db.prepare(`
      SELECT 1 FROM ref_activations
      WHERE user_telegram_id = ?
    `).get(updatedUser.telegramId);

    if (
      !alreadyActivated &&
      Number(updatedUser.ads_total || 0) + 1 >= 10 &&
      updatedUser.referrer_telegram_id
    ) {

      db.prepare(`
        INSERT INTO ref_activations (
          user_telegram_id,
          referrer_telegram_id,
          activated_at
        ) VALUES (?, ?, ?)
      `).run(
        updatedUser.telegramId,
        updatedUser.referrer_telegram_id,
        Date.now()
      );

      // console.log('🥉 REF ACTIVATED:', {
      //   user: updatedUser.telegramId,
      //   referrer: updatedUser.referrer_telegram_id,
      //   ads_total: updatedUser.ads_total
      // });
    }

    if (!result?.ok) {
      db.prepare(`
        UPDATE monetag_postbacks
        SET reward_claimed = 0,
            reward_claimed_at = 0
        WHERE ymid = ?
          AND LOWER(COALESCE(event_type, '')) = 'click'
      `).run(ymid);

      return res.json({
        success: false,
        error: result?.error || 'ad_reward_failed',
        message: result?.message
      });
    }

    const fixedAdsDay = Math.min(beforeAdsDay + ADS_PER_CLAIM, ADS_DAY_LIMIT);
    const fixedAdsHour = Math.min(beforeAdsHour + ADS_PER_CLAIM, ADS_HOUR_LIMIT);
    const fixedAdsTotal = beforeAdsTotal + 1;
    const now = Date.now();

    db.prepare(`
      UPDATE users
      SET ads_total = ?,
          ads_day = ?,
          ads_hour = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(
      fixedAdsTotal,
      fixedAdsDay,
      fixedAdsHour,
      now,
      telegramId
    );

    if (result.user) {
      result.user.ads_total = fixedAdsTotal;
      result.user.ads_day = fixedAdsDay;
      result.user.ads_hour = fixedAdsHour;
    }

    try {
      const drawId = ensureActiveDrawId(db);
      const stats = ensureDrawUserStats(db, drawId, telegramId);
      if (stats) {
        db.prepare(`
          UPDATE draw_user_stats
          SET ads_round = COALESCE(ads_round, 0) + 1,
              updatedAt = ?
          WHERE draw_id = ? AND telegramId = ?
        `).run(Date.now(), drawId, telegramId);
      }
    } catch (e) {
      console.error('round ads update error:', e);
    }

    recalcDrawScore(db, telegramId);

    return res.json({
      success: true,
      balance: Number(result.user.wbc_balance || 0),
      wbc_balance: Number(result.user.wbc_balance || 0),
      ton_balance: Number(result.user.ton_balance || 0),
      energy: Number(result.user.energy || 0),
      rank_id: Number(result.user.rank_id || 1),
      rank_expires_at: Number(result.user.rank_expires_at || 0),
      adsDay: Number(result.user.ads_day || 0),
      adsHour: Number(result.user.ads_hour || 0),
      meta: result.meta
    });
  }
);

// ===== RANK BUY =====
app.post('/api/rank/buy', requireTelegramAuth, (req, res) => {
  const telegramUser = req.telegramUser;
  const rankId = Number(req.body?.rank_id);
  const currency = String(req.body?.currency || '').toUpperCase();

  let user = getOrCreateUser(telegramUser);
  user = regenEnergy(user);
  user = refreshAdCounters(user);
  user = ensureRankExpiredReset(expireRankIfNeeded(db, user).user);

  const paymentOption = findPaymentOption(rankId, currency);
  if (!paymentOption) {
    return res.status(400).json({
      success: false,
      error: 'Unsupported payment option'
    });
  }

  const result = purchaseRank(db, user, rankId, currency);
  if (!result.ok) {
    return res.status(400).json({
      success: false,
      error: result.error
    });
  }

  return res.json({
    success: true,
    rank_id: Number(result.user.rank_id || 1),
    rank_expires_at: Number(result.user.rank_expires_at || 0),
    balance: Number(result.user.wbc_balance || 0),
    wbc_balance: Number(result.user.wbc_balance || 0),
    ton_balance: Number(result.user.ton_balance || 0),
    payment: result.payment
  });
});


// ===== RANK BUY TON CREATE =====
app.post('/api/rank/buy-ton/create', requireTelegramAuth, (req, res) => {
  try {
    const telegramUser = req.telegramUser;
    const rankId = Number(req.body?.rank_id);

    let user = getOrCreateUser(telegramUser);
    user = regenEnergy(user);
    user = refreshAdCounters(user);
    user = ensureRankExpiredReset(expireRankIfNeeded(db, user).user);

    const paymentOption = findPaymentOption(rankId, 'TON');
    if (!paymentOption) {
      return res.status(400).json({
        success: false,
        error: 'ton_not_available'
      });
    }

    const tonWallet = String(
      process.env.TON_WALLET || 'UQD6DEVg7LMrRJ3p86JCF4SDF5ejXzPBgFJWdrk8X6unUYm4'
    ).trim();

    if (!tonWallet) {
      return res.status(500).json({
        success: false,
        error: 'ton_wallet_not_configured'
      });
    }

    const amountTon = Number(paymentOption.amount || 0);
    if (!(amountTon > 0)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_ton_amount'
      });
    }

    const payload = [
      'rank',
      rankId,
      String(user.telegramId),
      Date.now(),
      crypto.randomBytes(4).toString('hex')
    ].join('_');

    const now = Date.now();

    db.prepare(`
      INSERT INTO ton_rank_payments
      (telegramId, rank_id, amount_ton, pay_to_wallet, payload, status, createdAt, confirmedAt)
      VALUES (?, ?, ?, ?, ?, 'created', ?, 0)
    `).run(
      String(user.telegramId),
      rankId,
      amountTon,
      tonWallet,
      payload,
      now
    );

    return res.json({
      success: true,
      payload,
      tx: {
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [
          {
            address: tonWallet,
            amount: tonAmountToNanoString(amountTon)
          }
        ]
      }
    });
  } catch (e) {
    console.error('buy-ton-create error:', e);
    return res.status(500).json({
      success: false,
      error: 'internal_error'
    });
  }
});


// ===== TON VERIFY HELPERS =====
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTonAddress(value) {
  if (!value) return '';
  try {
    const { Address } = require('@ton/core');
    return Address.parse(String(value).trim()).toString({
      bounceable: false,
      urlSafe: true,
      testOnly: false
    });
  } catch (e) {
    return String(value || '').trim();
  }
}

function tonAmountToNanoString(amountTon) {
  const normalized = String(amountTon ?? '').trim();
  if (!normalized) return '0';

  const parts = normalized.split('.');
  const whole = String(parts[0] || '0').replace(/\D/g, '') || '0';
  const frac = String(parts[1] || '').replace(/\D/g, '').slice(0, 9).padEnd(9, '0');

  const combined = `${whole}${frac}`.replace(/^0+(?=\d)/, '');
  return combined || '0';
}

function parseExternalMessageProof(bocBase64) {
  const { Cell, loadMessage, beginCell } = require('@ton/core');

  const root = Cell.fromBase64(String(bocBase64).trim());
  const message = loadMessage(root.beginParse());

  if (message.info.type !== 'external-in') {
    throw new Error(`Expected external-in message, got ${message.info.type}`);
  }

  const dest = message.info.dest;
  if (!dest) {
    throw new Error('External message destination not found');
  }

  const normalizedHash = beginCell()
    .storeUint(2, 2)     // external-in
    .storeUint(0, 2)     // addr_none
    .storeAddress(dest)
    .storeUint(0, 4)     // import_fee = 0
    .storeBit(false)     // no StateInit
    .storeBit(true)      // body as ref
    .storeRef(message.body)
    .endCell()
    .hash()
    .toString('hex');

  return {
    normalizedHash,
    senderWallet: normalizeTonAddress(
      dest.toString({
        bounceable: false,
        urlSafe: true,
        testOnly: false
      })
    )
  };
}

async function toncenterTransactionsByMessage(msgHash) {
  const url = new URL('https://toncenter.com/api/v3/transactionsByMessage');
  url.searchParams.set('direction', 'in');
  url.searchParams.set('msg_hash', msgHash);
  url.searchParams.set('limit', '10');

  const headers = { accept: 'application/json' };
  if (process.env.TONCENTER_KEY) {
    headers['X-API-Key'] = process.env.TONCENTER_KEY;
  }

  const response = await fetch(url.toString(), { headers });
  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`TON Center ${response.status}: ${rawText.slice(0, 300)}`);
  }

  let data = {};
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw new Error('TON Center returned invalid JSON');
  }

  return Array.isArray(data.transactions) ? data.transactions : [];
}

async function tonapiEventByMessage(msgHash) {
  const url = `https://tonapi.io/v2/blockchain/messages/${msgHash}/transaction`;

  const headers = { accept: 'application/json' };
  if (process.env.TONAPI_KEY) {
    headers['Authorization'] = `Bearer ${process.env.TONAPI_KEY}`;
  }

  const response = await fetch(url, { headers });
  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`TonAPI ${response.status}: ${rawText.slice(0, 300)}`);
  }

  let data = {};
  try {
    data = JSON.parse(rawText);
  } catch (e) {
    throw new Error('TonAPI returned invalid JSON');
  }

  return data || null;
}

function tonapiToPseudoTx(eventTx) {
  if (!eventTx) return null;

  const out_msgs = Array.isArray(eventTx.out_msgs)
    ? eventTx.out_msgs.map((msg) => ({
        destination: msg?.destination?.address || msg?.destination || '',
        value: msg?.value ?? msg?.amount ?? '0'
      }))
    : [];

  return {
    hash: eventTx?.hash || '',
    account: eventTx?.account?.address || eventTx?.account || '',
    out_msgs
  };
}

function readTxHash(tx) {
  return String(
    tx?.hash ||
    tx?.tx_hash ||
    tx?.transaction_hash ||
    ''
  ).trim();
}

function readTxAccount(tx) {
  return String(
    tx?.account?.address ||
    tx?.account ||
    tx?.account_id ||
    tx?.address ||
    ''
  ).trim();
}

function collectOutMessages(tx) {
  const result = [];

  if (Array.isArray(tx?.out_msgs)) result.push(...tx.out_msgs);
  if (Array.isArray(tx?.outMessages)) result.push(...tx.outMessages);

  if (Array.isArray(tx?.messages)) {
    for (const msg of tx.messages) {
      const direction = String(msg?.direction || '').toLowerCase();
      if (direction !== 'in') result.push(msg);
    }
  }

  return result;
}

function readMessageDestination(msg) {
  return String(
    msg?.destination?.address ||
    msg?.destination ||
    msg?.dest?.address ||
    msg?.dest ||
    msg?.address ||
    ''
  ).trim();
}

function readMessageValue(msg) {
  return String(
    msg?.value ??
    msg?.amount ??
    msg?.coins ??
    msg?.value_extra ??
    '0'
  ).trim();
}

function txMatchesPayment(tx, senderWallet, payToWallet, amountNano) {
  const senderNormalized = normalizeTonAddress(senderWallet);
  const accountNormalized = normalizeTonAddress(readTxAccount(tx));

  if (senderNormalized && accountNormalized && senderNormalized !== accountNormalized) {
    return false;
  }

  const payToNormalized = normalizeTonAddress(payToWallet);
  const neededNano = BigInt(String(amountNano || '0'));

  for (const msg of collectOutMessages(tx)) {
    const destNormalized = normalizeTonAddress(readMessageDestination(msg));
    if (!destNormalized || destNormalized !== payToNormalized) continue;

    let valueNano = 0n;
    try {
      valueNano = BigInt(String(readMessageValue(msg) || '0'));
    } catch (e) {
      valueNano = 0n;
    }

    if (valueNano >= neededNano) {
      return true;
    }
  }

  return false;
}

function activateRankFromExternalTonPayment(db, telegramId, rankId) {
  const now = Date.now();
  const rankExpiresAt = now + (7 * 24 * 60 * 60 * 1000);

  db.prepare(`
    UPDATE users
    SET rank_id = ?, rank_expires_at = ?, updatedAt = ?
    WHERE telegramId = ?
  `).run(rankId, rankExpiresAt, now, String(telegramId));

  return db.prepare(`
    SELECT *
    FROM users
    WHERE telegramId = ?
    LIMIT 1
  `).get(String(telegramId));
}

// ===== RANK BUY TON CONFIRM =====
app.post('/api/rank/buy-ton/confirm', requireTelegramAuth, async (req, res) => {
  try {
    const telegramUser = req.telegramUser;
    const rankId = Number(req.body?.rank_id);
    const payload = String(req.body?.payload || '').trim();
    const proofBoc = String(req.body?.tx_hash || req.body?.proof_boc || '').trim();

    if (!rankId || !payload || !proofBoc) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields'
      });
    }

    let user = getOrCreateUser(telegramUser);
    user = regenEnergy(user);
    user = refreshAdCounters(user);
    user = ensureRankExpiredReset(expireRankIfNeeded(db, user).user);

    const paymentOption = findPaymentOption(rankId, 'TON');
    if (!paymentOption) {
      return res.status(400).json({
        success: false,
        error: 'ton_not_available'
      });
    }

    const tonWallet = String(
      process.env.TON_WALLET || 'UQD6DEVg7LMrRJ3p86JCF4SDF5ejXzPBgFJWdrk8X6unUYm4'
    ).trim();

    const payment = db.prepare(`
      SELECT *
      FROM ton_rank_payments
      WHERE payload = ?
      LIMIT 1
    `).get(payload);

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'payment_not_found'
      });
    }

    if (String(payment.telegramId) !== String(user.telegramId)) {
      return res.status(403).json({
        success: false,
        error: 'payment_owner_mismatch'
      });
    }

    if (Number(payment.rank_id) !== rankId) {
      return res.status(400).json({
        success: false,
        error: 'rank_mismatch'
      });
    }

    if (String(payment.pay_to_wallet || '').trim() !== tonWallet) {
      return res.status(400).json({
        success: false,
        error: 'wallet_mismatch'
      });
    }

    if (String(payment.status || '') === 'confirmed') {
      return res.status(400).json({
        success: false,
        error: 'already_confirmed'
      });
    }

    let parsedProof = null;
    try {
      parsedProof = parseExternalMessageProof(proofBoc);
    } catch (e) {
      console.error('proof parse error:', e);
      return res.status(400).json({
        success: false,
        error: 'invalid_proof_boc'
      });
    }

    const amountNano = tonAmountToNanoString(payment.amount_ton);

    let verifiedTx = null;
    let lastLookupError = '';

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const txs = await toncenterTransactionsByMessage(parsedProof.normalizedHash);
        verifiedTx = txs.find((tx) =>
          txMatchesPayment(tx, parsedProof.senderWallet, tonWallet, amountNano)
        ) || null;

        if (verifiedTx) break;
      } catch (e) {
        console.error('toncenter lookup error:', e);
        lastLookupError = String(e?.message || e || '');
      }

      if (!verifiedTx) {
        try {
          const tonapiTx = await tonapiEventByMessage(parsedProof.normalizedHash);
          const pseudoTx = tonapiToPseudoTx(tonapiTx);

          if (pseudoTx && txMatchesPayment(pseudoTx, parsedProof.senderWallet, tonWallet, amountNano)) {
            verifiedTx = pseudoTx;
            break;
          }
        } catch (e) {
          console.error('tonapi lookup error:', e);
          if (!lastLookupError) {
            lastLookupError = String(e?.message || e || '');
          }
        }
      }

      if (attempt < 7) {
        await sleep(2500);
      }
    }

    if (!verifiedTx) {
      return res.status(400).json({
        success: false,
        error: lastLookupError ? 'tx_not_indexed_yet' : 'tx_not_found_onchain'
      });
    }

    const chainTxHash = readTxHash(verifiedTx) || parsedProof.normalizedHash;

    const existingTx = db.prepare(`
      SELECT id, payload
      FROM ton_rank_payments
      WHERE tx_hash = ?
      LIMIT 1
    `).get(chainTxHash);

    if (existingTx && String(existingTx.payload) !== payload) {
      return res.status(400).json({
        success: false,
        error: 'tx_hash_already_used'
      });
    }

    db.prepare(`
      UPDATE ton_rank_payments
      SET tx_hash = ?, status = 'confirmed', confirmedAt = ?
      WHERE payload = ?
    `).run(chainTxHash, Date.now(), payload);

    
    // ===== ADD TON DONATION TO USER STATS =====
    try {
      const amountTon = Number(payment.amount_ton || 0);

      db.prepare(`
        UPDATE users
        SET donation_ton_total = COALESCE(donation_ton_total, 0) + ?
        WHERE telegramId = ?
      `).run(amountTon, String(user.telegramId));

      const drawId = ensureActiveDrawId(db);
      const stats = ensureDrawUserStats(db, drawId, String(user.telegramId));
      if (stats) {
        db.prepare(`
          UPDATE draw_user_stats
          SET donation_ton_round = COALESCE(donation_ton_round, 0) + ?,
              updatedAt = ?
          WHERE draw_id = ? AND telegramId = ?
        `).run(amountTon, Date.now(), drawId, String(user.telegramId));
      }
    } catch (e) {
      console.error('donation_ton_total update error:', e);
    }

    const updatedUser = activateRankFromExternalTonPayment(
      db,
      user.telegramId,
      rankId
    );

    recalcDrawScore(db, user.telegramId);

    return res.json({
      success: true,
      rank_id: Number(updatedUser?.rank_id || rankId || 1),
      rank_expires_at: Number(updatedUser?.rank_expires_at || 0),
      balance: Number(updatedUser?.wbc_balance || 0),
      wbc_balance: Number(updatedUser?.wbc_balance || 0),
      ton_balance: Number(updatedUser?.ton_balance || 0),
      payment: {
        payload,
        tx_hash: chainTxHash,
        wallet: tonWallet,
        amount_ton: Number(payment.amount_ton || 0),
        status: 'confirmed',
        sender_wallet: parsedProof.senderWallet
      }
    });
  } catch (e) {
    console.error('buy-ton-confirm error:', e);
    return res.status(500).json({
      success: false,
      error: 'internal_error'
    });
  }
});


// ===== STATS =====
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const online = db.prepare(`
    SELECT COUNT(*) as count
    FROM users
    WHERE lastTap > ?
  `).get(Date.now() - 5 * 60 * 1000).count;

  return res.json({
    totalUsers: total,
    onlineUsers: online
  });
});

app.get('/api/admin/overview', (req, res) => {
  try {
    const token = String(req.query?.token || '').trim();
    const adminToken = String(process.env.ADMIN_STATS_TOKEN || process.env.ADMIN_TOKEN || '').trim();

    if (!adminToken || token !== adminToken) {
      return res.status(403).json({ success: false, error: 'forbidden' });
    }

    const totalUsers = Number(
      db.prepare(`SELECT COUNT(*) as count FROM users`).get().count || 0
    );

    const onlineUsers = Number(
      db.prepare(`
        SELECT COUNT(*) as count
        FROM users
        WHERE lastTap > ?
      `).get(Date.now() - 5 * 60 * 1000).count || 0
    );

    const userTotals = db.prepare(`
      SELECT
        COALESCE(SUM(ton_balance), 0) as total_ton_balance,
        COALESCE(SUM(donation_ton_total), 0) as total_donation_ton,
        COALESCE(SUM(star_spent_total), 0) as total_star_spent,
        COALESCE(SUM(taps_total), 0) as total_taps,
        COALESCE(SUM(ads_total), 0) as total_ads,
        COALESCE(SUM(referrals_total), 0) as total_referrals
      FROM users
    `).get() || {};

    const withdrawTotals = db.prepare(`
      SELECT
        COUNT(*) as total_withdraw_requests,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_withdraw_requests
      FROM withdraw_requests
    `).get() || {};

    const drawStats = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) as active_draws,
        COALESCE(SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END), 0) as locked_draws,
        COALESCE(SUM(CASE WHEN status = 'completed' OR status = 'finished' THEN 1 ELSE 0 END), 0) as completed_draws
      FROM draw_rounds
    `).get() || {};

    return res.json({
      success: true,
      totalUsers,
      onlineUsers,
      totalTonBalance: Number(userTotals.total_ton_balance || 0),
      totalDonationTon: Number(userTotals.total_donation_ton || 0),
      totalStarSpent: Number(userTotals.total_star_spent || 0),
      totalTaps: Number(userTotals.total_taps || 0),
      totalAds: Number(userTotals.total_ads || 0),
      totalReferrals: Number(userTotals.total_referrals || 0),
      totalWithdrawRequests: Number(withdrawTotals.total_withdraw_requests || 0),
      pendingWithdrawRequests: Number(withdrawTotals.pending_withdraw_requests || 0),
      activeDraws: Number(drawStats.active_draws || 0),
      lockedDraws: Number(drawStats.locked_draws || 0),
      completedDraws: Number(drawStats.completed_draws || 0)
    });
  } catch (e) {
    console.error('admin overview error:', e);
    return res.status(500).json({ success: false, error: 'admin_overview_failed' });
  }
});

db.prepare(`
  CREATE TABLE IF NOT EXISTS draw_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    draw_id INTEGER NOT NULL,
    telegramId TEXT NOT NULL,
    place INTEGER NOT NULL,
    reward REAL NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL
  )
`).run();

function getAdminToken(req) {
  return String(req.query?.token || req.headers['x-admin-token'] || '').trim();
}

function requireAdminAccess(req, res) {
  const token = getAdminToken(req);
  const adminToken = String(process.env.ADMIN_STATS_TOKEN || process.env.ADMIN_TOKEN || '').trim();

  if (!adminToken || token !== adminToken) {
    res.status(403).json({ success: false, error: 'forbidden' });
    return false;
  }

  return true;
}

app.get('/api/admin/users', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const q = String(req.query?.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query?.limit || 25), 1), 200);
    const offset = Math.max(Number(req.query?.offset || 0), 0);

    const sortRaw = String(req.query?.sort || 'updatedAt').trim();
    const orderRaw = String(req.query?.order || 'desc').trim().toLowerCase();

    const sortMap = {
      updatedAt: 'updatedAt',
      createdAt: 'createdAt',
      rank: 'rank_id',
      wbc: 'wbc_balance',
      tonDonate: 'donation_ton_total',
      tonBalance: 'ton_balance',
      stars: 'star_spent_total',
      refs: 'referrals_total',
      ads: 'ads_total',
      taps: 'taps_total',
      keys: 'zero_day_keys_balance',
      drawScore: 'draw_score_cached'
    };

    const sortCol = sortMap[sortRaw] || 'updatedAt';
    const sortDir = orderRaw === 'asc' ? 'ASC' : 'DESC';

    const filters = {
      online: String(req.query?.online || '') === '1',
      hasKeys: String(req.query?.hasKeys || '') === '1',
      tonDonate: String(req.query?.tonDonate || '') === '1',
      tonBalance: String(req.query?.tonBalance || '') === '1',
      stars: String(req.query?.stars || '') === '1',
      rankGt1: String(req.query?.rankGt1 || '') === '1',
      ads: String(req.query?.ads || '') === '1',
      refs: String(req.query?.refs || '') === '1',
      activeRecent: String(req.query?.activeRecent || '') === '1'
    };

    const where = [];
    const params = [];

    if (q) {
      const like = `%${q}%`;
      where.push(`(
        telegramId LIKE ?
        OR username LIKE ?
        OR first_name LIKE ?
        OR last_name LIKE ?
      )`);
      params.push(like, like, like, like);
    }

    if (filters.online) {
      where.push('COALESCE(lastTap, 0) > ?');
      params.push(Date.now() - 5 * 60 * 1000);
    }

    if (filters.hasKeys) where.push('COALESCE(zero_day_keys_balance, 0) > 0');
    if (filters.tonDonate) where.push('COALESCE(donation_ton_total, 0) > 0');
    if (filters.tonBalance) where.push('COALESCE(ton_balance, 0) > 0');
    if (filters.stars) where.push('COALESCE(star_spent_total, 0) > 0');
    if (filters.rankGt1) where.push('COALESCE(rank_id, 1) > 1');
    if (filters.ads) where.push('COALESCE(ads_total, 0) > 0');
    if (filters.refs) where.push('COALESCE(referrals_total, 0) > 0');

    if (filters.activeRecent) {
      where.push('COALESCE(updatedAt, 0) > ?');
      params.push(Date.now() - 24 * 60 * 60 * 1000);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = Number(
      db.prepare(`
        SELECT COUNT(*) as count
        FROM users
        ${whereSql}
      `).get(...params)?.count || 0
    );

    const rows = db.prepare(`
      SELECT
        telegramId,
        username,
        first_name,
        last_name,
        rank_id,
        wbc_balance,
        ton_balance,
        energy,
        zero_day_keys_balance,
        referrals_total,
        donation_ton_total,
        star_spent_total,
        ads_total,
        taps_total,
        draw_score_cached,
        createdAt,
        updatedAt
      FROM users
      ${whereSql}
      ORDER BY ${sortCol} ${sortDir}, updatedAt DESC, createdAt DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return res.json({
      success: true,
      total,
      limit,
      offset,
      sort: sortRaw,
      order: orderRaw === 'asc' ? 'asc' : 'desc',
      filters,
      users: rows
    });
  } catch (e) {
    console.error('admin users error:', e);
    return res.status(500).json({ success: false, error: 'admin_users_failed' });
  }
});

app.get('/api/admin/user/:telegramId', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const telegramId = String(req.params?.telegramId || '').trim();
    if (!telegramId) {
      return res.status(400).json({ success: false, error: 'invalid_telegram_id' });
    }

    const user = db.prepare(`
      SELECT
        telegramId,
        username,
        first_name,
        last_name,
        rank,
        rank_id,
        rank_expires_at,
        energy,
        wbc_balance,
        ton_balance,
        zero_day_keys_balance,
        referrals_total,
        donation_ton_total,
        star_spent_total,
        ads_total,
        taps_total,
        draw_score_cached,
        ref_code,
        createdAt,
        updatedAt
      FROM users
      WHERE telegramId = ?
      LIMIT 1
    `).get(telegramId);

    if (!user) {
      return res.status(404).json({ success: false, error: 'user_not_found' });
    }

    const drawId = ensureActiveDrawId(db);

    const draw = db.prepare(`
      SELECT *
      FROM draw_rounds
      WHERE id = ?
      LIMIT 1
    `).get(drawId);

    const stats = ensureDrawUserStats(db, drawId, telegramId) || {
      taps_round: 0,
      ads_round: 0,
      refs_round: 0,
      donation_ton_round: 0,
      stars_round: 0,
      entries: 0,
      eligible: 0,
      score_cached: 0
    };

    const entryRow = db.prepare(`
      SELECT entries, createdAt, updatedAt
      FROM draw_entries
      WHERE draw_id = ? AND telegramId = ?
      LIMIT 1
    `).get(drawId, telegramId) || {
      entries: 0,
      createdAt: 0,
      updatedAt: 0
    };

    function norm(x, s) {
      const value = Math.max(0, Number(x || 0));
      const scale = Math.max(0.000001, Number(s || 1));
      return 1 - Math.exp(-value / scale);
    }

    const drawEntries = Number(entryRow?.entries || 0);
    const eligible = drawEntries > 0 ? 1 : 0;

    let keyProgress = 0;
    if (drawEntries === 1) keyProgress = 0.60;
    else if (drawEntries >= 2) keyProgress = 1.00;

    const multipliers = {
      BASE: 100,
      keyProgress: Math.round(keyProgress * 1000) / 1000,
      K: Math.round((1 + 2.0 * keyProgress) * 1000) / 1000,
      R: Math.round((1 + 1.6 * norm(stats.refs_round, 3)) * 1000) / 1000,
      T: Math.round((1 + 1.5 * norm(stats.donation_ton_round, 1.5)) * 1000) / 1000,
      S: Math.round((1 + 1.25 * norm(stats.stars_round, 1000)) * 1000) / 1000,
      A: Math.round((1 + 1.2 * norm(stats.ads_round, 20)) * 1000) / 1000,
      P: Math.round((1 + 1.1 * norm(stats.taps_round, 5000)) * 1000) / 1000
    };

    const recomputedScore = eligible
      ? Math.round(
          Number(
            multipliers.BASE *
            multipliers.K *
            multipliers.R *
            multipliers.T *
            multipliers.S *
            multipliers.A *
            multipliers.P
          ) * 1000
        ) / 1000
      : 0;

    return res.json({
      success: true,
      user,
      active_draw: draw || null,
      draw_entry: {
        entries: drawEntries,
        eligible,
        createdAt: Number(entryRow?.createdAt || 0),
        updatedAt: Number(entryRow?.updatedAt || 0)
      },
      draw_stats: {
        taps_round: Number(stats.taps_round || 0),
        ads_round: Number(stats.ads_round || 0),
        refs_round: Number(stats.refs_round || 0),
        donation_ton_round: Number(stats.donation_ton_round || 0),
        stars_round: Number(stats.stars_round || 0),
        entries: Number(stats.entries || 0),
        eligible: Number(stats.eligible || 0),
        score_cached: Number(stats.score_cached || 0),
        updatedAt: Number(stats.updatedAt || 0)
      },
      multipliers,
      score: {
        cached: Number(stats.score_cached || user.draw_score_cached || 0),
        recomputed: recomputedScore
      }
    });
  } catch (e) {
    console.error('admin user details error:', e);
    return res.status(500).json({ success: false, error: 'admin_user_details_failed' });
  }
});



app.get('/api/admin/promos', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) {
      return;
    }

    const rows = db.prepare(`
      SELECT
        id,
        code,
        reward_ton,
        reward_wbc,
        max_claims,
        claims_count,
        active,
        expires_at,
        createdAt
      FROM promo_codes
      ORDER BY id DESC
    `).all();

    return res.json({
      success: true,
      promos: (rows || []).map((row) => ({
        id: Number(row.id || 0),
        code: String(row.code || ''),
        reward_ton: Number(row.reward_ton || 0),
        reward_wbc: Number(row.reward_wbc || 0),
        max_claims: Number(row.max_claims || 0),
        claims_count: Number(row.claims_count || 0),
        remaining_claims: Number(row.max_claims || 0) > 0
          ? Math.max(0, Number(row.max_claims || 0) - Number(row.claims_count || 0))
          : 0,
        active: Number(row.active || 0),
        expires_at: Number(row.expires_at || 0),
        createdAt: Number(row.createdAt || 0)
      }))
    });
  } catch (e) {
    console.error('admin promos list error:', e);
    return res.status(500).json({ success: false, error: 'admin_promos_failed' });
  }
});

app.post('/api/admin/promo/create', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) {
      return;
    }

    const now = Date.now();

    const rawCode = String(req.body?.code || '').trim().toUpperCase();
    const rewardTon = Number(req.body?.reward_ton || 0);
    const durationHours = Number(req.body?.duration_hours || 0);
    const maxClaims = Number(req.body?.max_claims || 0);

    if (!rawCode) {
      return res.status(400).json({ success: false, error: 'code_required' });
    }

    if (!/^[A-Z0-9_-]{3,40}$/.test(rawCode)) {
      return res.status(400).json({ success: false, error: 'invalid_code_format' });
    }

    if (!Number.isFinite(rewardTon) || rewardTon <= 0) {
      return res.status(400).json({ success: false, error: 'invalid_reward_ton' });
    }

    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      return res.status(400).json({ success: false, error: 'invalid_duration_hours' });
    }

    if (!Number.isFinite(maxClaims) || maxClaims < 0 || !Number.isInteger(maxClaims)) {
      return res.status(400).json({ success: false, error: 'invalid_max_claims' });
    }

    const existing = db.prepare(`
      SELECT id
      FROM promo_codes
      WHERE code = ?
      LIMIT 1
    `).get(rawCode);

    if (existing?.id) {
      return res.status(409).json({ success: false, error: 'promo_code_exists' });
    }

    const expiresAt = now + Math.floor(durationHours * 60 * 60 * 1000);

    const info = db.prepare(`
      INSERT INTO promo_codes (
        code,
        reward_ton,
        reward_wbc,
        max_claims,
        claims_count,
        active,
        expires_at,
        createdAt
      )
      VALUES (?, ?, 0, ?, 0, 1, ?, ?)
    `).run(
      rawCode,
      rewardTon,
      maxClaims,
      expiresAt,
      now
    );

    const created = db.prepare(`
      SELECT
        id,
        code,
        reward_ton,
        reward_wbc,
        max_claims,
        claims_count,
        active,
        expires_at,
        createdAt
      FROM promo_codes
      WHERE id = ?
      LIMIT 1
    `).get(info.lastInsertRowid);

    return res.json({
      success: true,
      promo: {
        id: Number(created.id || 0),
        code: String(created.code || ''),
        reward_ton: Number(created.reward_ton || 0),
        reward_wbc: Number(created.reward_wbc || 0),
        max_claims: Number(created.max_claims || 0),
        claims_count: Number(created.claims_count || 0),
        active: Number(created.active || 0),
        expires_at: Number(created.expires_at || 0),
        createdAt: Number(created.createdAt || 0)
      }
    });
  } catch (e) {
    console.error('admin promo create error:', e);
    return res.status(500).json({ success: false, error: 'admin_promo_create_failed' });
  }
});



app.post('/api/admin/promo/delete', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const id = Number(req.body?.id || 0);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: 'invalid_promo_id' });
    }

    const promo = db.prepare(`
      SELECT id, code
      FROM promo_codes
      WHERE id = ?
      LIMIT 1
    `).get(id);

    if (!promo) {
      return res.status(404).json({ success: false, error: 'promo_not_found' });
    }

    const tx = db.transaction(() => {
      db.prepare(`
        DELETE FROM promo_code_claims
        WHERE code_id = ?
      `).run(id);

      db.prepare(`
        DELETE FROM promo_codes
        WHERE id = ?
      `).run(id);
    });

    tx();

    return res.json({
      success: true,
      deleted_id: id,
      deleted_code: String(promo.code || '')
    });
  } catch (e) {
    console.error('admin promo delete error:', e);
    return res.status(500).json({ success: false, error: 'admin_promo_delete_failed' });
  }
});

app.post('/api/admin/promo/toggle', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const promoId = Number(req.body?.id || 0);
    if (!Number.isFinite(promoId) || promoId <= 0) {
      return res.status(400).json({ success: false, error: 'invalid_promo_id' });
    }

    const promo = db.prepare(`
      SELECT id, active
      FROM promo_codes
      WHERE id = ?
      LIMIT 1
    `).get(promoId);

    if (!promo) {
      return res.status(404).json({ success: false, error: 'promo_not_found' });
    }

    const nextActive = Number(promo.active || 0) === 1 ? 0 : 1;

    db.prepare(`
      UPDATE promo_codes
      SET active = ?
      WHERE id = ?
    `).run(nextActive, promoId);

    return res.json({
      success: true,
      id: promoId,
      active: nextActive
    });
  } catch (e) {
    console.error('admin promo toggle error:', e);
    return res.status(500).json({ success: false, error: 'admin_promo_toggle_failed' });
  }
});


app.get('/api/admin/withdraws', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const status = String(req.query?.status || '').trim();
    const limit = Math.min(Math.max(Number(req.query?.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query?.offset || 0), 0);

    let rows;
    let total;

    if (status) {
      total = Number(db.prepare(`
        SELECT COUNT(*) as count
        FROM withdraw_requests
        WHERE status = ?
      `).get(status)?.count || 0);

      rows = db.prepare(`
        SELECT
          id,
          telegramId,
          amount,
          currency,
          wallet,
          status,
          createdAt
        FROM withdraw_requests
        WHERE status = ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `).all(status, limit, offset);
    } else {
      total = Number(db.prepare(`
        SELECT COUNT(*) as count
        FROM withdraw_requests
      `).get()?.count || 0);

      rows = db.prepare(`
        SELECT
          id,
          telegramId,
          amount,
          currency,
          wallet,
          status,
          createdAt
        FROM withdraw_requests
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset);
    }

    return res.json({
      success: true,
      total,
      limit,
      offset,
      withdraws: rows
    });
  } catch (e) {
    console.error('admin withdraws error:', e);
    return res.status(500).json({ success: false, error: 'admin_withdraws_failed' });
  }
});

app.get('/api/admin/draws', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const limit = Math.min(Math.max(Number(req.query?.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query?.offset || 0), 0);

    const total = Number(db.prepare(`
      SELECT COUNT(*) as count
      FROM draw_rounds
    `).get()?.count || 0);

    const rows = db.prepare(`
      SELECT
        d.id,
        d.status,
        d.createdAt,
        d.closedAt,
        COALESCE(COUNT(e.id), 0) as participant_rows,
        COALESCE(SUM(e.entries), 0) as total_entries
      FROM draw_rounds d
      LEFT JOIN draw_entries e ON e.draw_id = d.id
      GROUP BY d.id
      ORDER BY d.id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    return res.json({
      success: true,
      total,
      limit,
      offset,
      draws: rows
    });
  } catch (e) {
    console.error('admin draws error:', e);
    return res.status(500).json({ success: false, error: 'admin_draws_failed' });
  }
});

app.get('/api/admin/winners', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const limit = Math.min(Math.max(Number(req.query?.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query?.offset || 0), 0);

    const total = Number(db.prepare(`
      SELECT COUNT(*) as count
      FROM draw_winners
    `).get()?.count || 0);

    const rows = db.prepare(`
      SELECT
        w.id,
        w.draw_id,
        w.telegramId,
        u.username,
        w.place,
        w.reward,
        w.score,
        w.createdAt
      FROM draw_winners w
      LEFT JOIN users u ON u.telegramId = w.telegramId
      ORDER BY w.id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    return res.json({
      success: true,
      total,
      limit,
      offset,
      winners: rows
    });
  } catch (e) {
    console.error('admin winners error:', e);
    return res.status(500).json({ success: false, error: 'admin_winners_failed' });
  }
});


app.post('/api/admin/draw/lock', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const round = db.prepare(`
      SELECT *
      FROM draw_rounds
      WHERE status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (!round) {
      return res.status(400).json({ success: false, error: 'no_active_draw' });
    }

    const now = Date.now();

    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE draw_rounds
        SET status = 'locked',
            closedAt = ?
        WHERE id = ?
      `).run(now, round.id);

      const nextActive = db.prepare(`
        SELECT id
        FROM draw_rounds
        WHERE status = 'active'
        ORDER BY id DESC
        LIMIT 1
      `).get();

      if (!nextActive) {
        db.prepare(`
          INSERT INTO draw_rounds (status, createdAt)
          VALUES ('active', ?)
        `).run(now);
      }
    });

    tx();

    const newActive = db.prepare(`
      SELECT id
      FROM draw_rounds
      WHERE status = 'active'
      ORDER BY id DESC
      LIMIT 1
    `).get();

    return res.json({
      success: true,
      locked_draw_id: round.id,
      next_active_draw_id: Number(newActive?.id || 0),
      status: 'locked'
    });
  } catch (e) {
    console.error('admin draw lock error:', e);
    return res.status(500).json({ success: false, error: 'admin_draw_lock_failed' });
  }
});

app.post('/api/admin/draw/finish', async (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const draw = db.prepare(`
      SELECT *
      FROM draw_rounds
      WHERE status = 'locked'
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (!draw) {
      return res.status(400).json({ success: false, error: 'no_locked_round' });
    }

    const winnersAlreadySaved = db.prepare(`
      SELECT COUNT(*) AS c
      FROM draw_winners
      WHERE draw_id = ?
    `).get(draw.id);

    if (Number(winnersAlreadySaved?.c || 0) > 0) {
      return res.status(400).json({ success: false, error: 'round_already_finished' });
    }

    const participants = db.prepare(`
      SELECT
        u.telegramId,
        COALESCE(u.draw_score_cached, 0) AS draw_score_cached,
        COALESCE(e.entries, 0) AS entries
      FROM users u
      JOIN draw_entries e ON e.telegramId = u.telegramId
      WHERE e.draw_id = ?
      ORDER BY draw_score_cached DESC, entries DESC, u.telegramId ASC
    `).all(draw.id);

    const now = Date.now();

    if (!participants.length) {
      const tx = db.transaction(() => {
        db.prepare(`
          UPDATE draw_rounds
          SET status = 'completed',
              closedAt = COALESCE(closedAt, ?)
          WHERE id = ?
        `).run(now, draw.id);

        const active = db.prepare(`
          SELECT id
          FROM draw_rounds
          WHERE status = 'active'
          ORDER BY id DESC
          LIMIT 1
        `).get();

        if (!active) {
          db.prepare(`
            INSERT INTO draw_rounds (status, createdAt)
            VALUES ('active', ?)
          `).run(now);
        }
      });

      tx();

      return res.json({
        success: true,
        draw_id: draw.id,
        winners_count: 0,
        total_pool: 0,
        winners: []
      });
    }

    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(donation_ton_total), 0) AS ton
      FROM users
    `).get() || {};

    const totalPool = Number((Number(totals.ton || 0) * 0.8).toFixed(6));
    const top = participants.slice(0, 25);
    const winners = [];

    function distribute(startIndex, endIndex, percent) {
      const slice = top.slice(startIndex, endIndex);
      if (!slice.length || percent <= 0 || totalPool <= 0) return;

      const bucket = totalPool * percent;
      const perUser = Number((bucket / slice.length).toFixed(6));

      for (let i = 0; i < slice.length; i += 1) {
        const u = slice[i];
        winners.push({
          telegramId: u.telegramId,
          place: startIndex + i + 1,
          reward: perUser,
          score: Number(u.draw_score_cached || 0)
        });
      }
    }

    distribute(0, 3, 0.4);
    distribute(3, 10, 0.4);
    distribute(10, 25, 0.2);

    const tx = db.transaction(() => {
      for (const w of winners) {
        db.prepare(`
          INSERT INTO draw_winners (
            draw_id,
            telegramId,
            place,
            reward,
            score,
            createdAt
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          draw.id,
          w.telegramId,
          w.place,
          w.reward,
          w.score,
          now
        );

        db.prepare(`
          UPDATE users
          SET ton_balance = COALESCE(ton_balance, 0) + ?,
              updatedAt = ?
          WHERE telegramId = ?
        `).run(w.reward, now, w.telegramId);
      }

      db.prepare(`
        UPDATE draw_rounds
        SET status = 'completed',
            closedAt = COALESCE(closedAt, ?)
        WHERE id = ?
      `).run(now, draw.id);

      const active = db.prepare(`
        SELECT id
        FROM draw_rounds
        WHERE status = 'active'
        ORDER BY id DESC
        LIMIT 1
      `).get();

      if (!active) {
        db.prepare(`
          INSERT INTO draw_rounds (status, createdAt)
          VALUES ('active', ?)
        `).run(now);
      }
    });

    tx();

    return res.json({
      success: true,
      draw_id: draw.id,
      winners_count: winners.length,
      total_pool: totalPool,
      winners
    });
  } catch (e) {
    console.error('admin draw finish error:', e);
    return res.status(500).json({ success: false, error: 'admin_draw_finish_failed' });
  }
});

app.post('/api/admin/withdraw/approve', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const id = Number(req.body?.id || 0);
    if (!id) {
      return res.status(400).json({ success: false, error: 'invalid_id' });
    }

    const item = db.prepare(`
      SELECT *
      FROM withdraw_requests
      WHERE id = ?
      LIMIT 1
    `).get(id);

    if (!item) {
      return res.status(404).json({ success: false, error: 'withdraw_not_found' });
    }

    db.prepare(`
      UPDATE withdraw_requests
      SET status = 'approved'
      WHERE id = ?
    `).run(id);

    return res.json({ success: true, id, status: 'approved' });
  } catch (e) {
    console.error('admin withdraw approve error:', e);
    return res.status(500).json({ success: false, error: 'admin_withdraw_approve_failed' });
  }
});

app.post('/api/admin/withdraw/reject', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const id = Number(req.body?.id || 0);
    if (!id) {
      return res.status(400).json({ success: false, error: 'invalid_id' });
    }

    const item = db.prepare(`
      SELECT *
      FROM withdraw_requests
      WHERE id = ?
      LIMIT 1
    `).get(id);

    if (!item) {
      return res.status(404).json({ success: false, error: 'withdraw_not_found' });
    }

    db.prepare(`
      UPDATE withdraw_requests
      SET status = 'rejected'
      WHERE id = ?
    `).run(id);

    return res.json({ success: true, id, status: 'rejected' });
  } catch (e) {
    console.error('admin withdraw reject error:', e);
    return res.status(500).json({ success: false, error: 'admin_withdraw_reject_failed' });
  }
});


app.post('/api/admin/withdraw/paid', (req, res) => {
  try {
    if (!requireAdminAccess(req, res)) return;

    const id = Number(req.body?.id || 0);
    if (!id) {
      return res.status(400).json({ success: false, error: 'invalid_id' });
    }

    const item = db.prepare(`
      SELECT *
      FROM withdraw_requests
      WHERE id = ?
      LIMIT 1
    `).get(id);

    if (!item) {
      return res.status(404).json({ success: false, error: 'withdraw_not_found' });
    }

    db.prepare(`
      UPDATE withdraw_requests
      SET status = 'paid'
      WHERE id = ?
    `).run(id);

    return res.json({ success: true, id, status: 'paid' });
  } catch (e) {
    console.error('admin withdraw paid error:', e);
    return res.status(500).json({ success: false, error: 'admin_withdraw_paid_failed' });
  }
});


app.get('/admin', (req, res) => {
  try {
    return res.sendFile(require('path').join(__dirname, 'admin.html'));
  } catch (e) {
    console.error('admin page error:', e);
    return res.status(500).send('admin page failed');
  }
});

// ===== HEALTH =====


// ===== ZERO DAY KEY + DRAW SYSTEM =====

// add column if not exists
try {
  db.prepare(`ALTER TABLE users ADD COLUMN zero_day_keys_balance INTEGER DEFAULT 0`).run();
} catch (e) {}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN taps_total INTEGER DEFAULT 0`).run();
} catch (e) {}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN ads_total INTEGER DEFAULT 0`).run();
} catch (e) {}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN referrals_total INTEGER DEFAULT 0`).run();
} catch (e) {}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN donation_ton_total REAL DEFAULT 0`).run();
} catch (e) {}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN draw_score_cached REAL DEFAULT 0`).run();
} catch (e) {}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN ref_code TEXT DEFAULT ''`).run();
} catch (e) {}
try {
  db.prepare(`ALTER TABLE users ADD COLUMN star_spent_total INTEGER DEFAULT 0`).run();
} catch (e) {}

// draw_rounds
db.prepare(`
CREATE TABLE IF NOT EXISTS draw_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT DEFAULT 'active',
  createdAt INTEGER,
  closedAt INTEGER
)
`).run();

// draw_entries
db.prepare(`
CREATE TABLE IF NOT EXISTS draw_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_id INTEGER,
  telegramId TEXT,
  entries INTEGER DEFAULT 0,
  createdAt INTEGER,
  updatedAt INTEGER
)
`).run();

// ref_activations
db.prepare(`
CREATE TABLE IF NOT EXISTS ref_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_telegram_id TEXT,
  referrer_telegram_id TEXT,
  activated_at INTEGER
)
`).run();

// ensure active draw
const _draw = db.prepare(`SELECT * FROM draw_rounds WHERE status='active'`).get();
if (!_draw) {
  db.prepare(`INSERT INTO draw_rounds (status, createdAt) VALUES ('active', ?)`).run(Date.now());
}


function ensureActiveDrawId(db) {
  const activeDraw = db.prepare(`
    SELECT id
    FROM draw_rounds
    WHERE status = 'active'
    ORDER BY id DESC
    LIMIT 1
  `).get();

  if (activeDraw?.id) return Number(activeDraw.id);

  const now = Date.now();
  const result = db.prepare(`
    INSERT INTO draw_rounds (status, createdAt)
    VALUES ('active', ?)
  `).run(now);

  return Number(result.lastInsertRowid || 0);
}

function ensureDrawUserStats(db, drawId, telegramId) {
  const tgId = String(telegramId || '').trim();
  const dId = Number(drawId || 0);
  if (!tgId || !dId) return null;

  let row = db.prepare(`
    SELECT *
    FROM draw_user_stats
    WHERE draw_id = ? AND telegramId = ?
    LIMIT 1
  `).get(dId, tgId);

  if (!row) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO draw_user_stats (
        draw_id,
        telegramId,
        taps_round,
        ads_round,
        refs_round,
        donation_ton_round,
        stars_round,
        entries,
        eligible,
        score_cached,
        createdAt,
        updatedAt
      ) VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?)
    `).run(dId, tgId, now, now);

    row = db.prepare(`
      SELECT *
      FROM draw_user_stats
      WHERE draw_id = ? AND telegramId = ?
      LIMIT 1
    `).get(dId, tgId);
  }

  return row || null;
}

function recalcDrawScore(db, telegramId) {
  const tgId = String(telegramId || '').trim();
  if (!tgId) return 0;

  const drawId = ensureActiveDrawId(db);
  if (!drawId) return 0;

  const stats = ensureDrawUserStats(db, drawId, tgId);
  if (!stats) return 0;

  const entryRow = db.prepare(`
    SELECT entries
    FROM draw_entries
    WHERE draw_id = ? AND telegramId = ?
    LIMIT 1
  `).get(drawId, tgId);

  const drawEntries = Number(entryRow?.entries || 0);
  const eligible = drawEntries > 0 ? 1 : 0;

  function norm(x, s) {
    const value = Math.max(0, Number(x || 0));
    const scale = Math.max(0.000001, Number(s || 1));
    return 1 - Math.exp(-value / scale);
  }

  let score = 0;

  if (eligible) {
    const BASE = 100;

    let keyProgress = 0;
    if (drawEntries === 1) keyProgress = 0.60;
    else if (drawEntries >= 2) keyProgress = 1.00;

    const K = 1 + 2.0 * keyProgress;
    const R = 1 + 1.6 * norm(stats.refs_round, 3);
    const T = 1 + 1.5 * norm(stats.donation_ton_round, 1.5);
    const S = 1 + 1.25 * norm(stats.stars_round, 1000);
    const A = 1 + 1.2 * norm(stats.ads_round, 20);
    const P = 1 + 1.1 * norm(stats.taps_round, 5000);

    score = BASE * K * R * T * S * A * P;
  }

  score = Math.round(Number(score) * 1000) / 1000;
  const now = Date.now();

  db.prepare(`
    UPDATE draw_user_stats
    SET entries = ?,
        eligible = ?,
        score_cached = ?,
        updatedAt = ?
    WHERE draw_id = ? AND telegramId = ?
  `).run(drawEntries, eligible, score, now, drawId, tgId);

  db.prepare(`
    UPDATE users
    SET draw_score_cached = ?,
        updatedAt = ?
    WHERE telegramId = ?
  `).run(score, now, tgId);

  return score;
}

// BUY KEY
app.post('/api/draw/ticket/buy', (req, res) => {
  try {
    const { telegramId } = req.body;
    const user = db.prepare(`SELECT * FROM users WHERE telegramId=?`).get(telegramId);
    if (!user) return res.json({ success: false });

    const PRICE = 2000000;
    if (Number(user.wbc_balance || 0) < PRICE) {
      return res.json({ success: false, error: 'no_wbc' });
    }

    db.prepare(`
      UPDATE users
      SET wbc_balance = COALESCE(wbc_balance, 0) - ?,
          balance = COALESCE(wbc_balance, 0) - ?,
          zero_day_keys_balance = COALESCE(zero_day_keys_balance, 0) + 1,
          updatedAt = ?
      WHERE telegramId=?
    `).run(PRICE, PRICE, Date.now(), telegramId);

    return res.json({ success: true });
  } catch (e) {
    console.error('DRAW BUY KEY ERROR:', e);
    return res.json({ success: false, error: 'draw_buy_failed' });
  }
});

// ENTER KEY
app.post('/api/draw/ticket/enter', (req, res) => {
  try {
    const { telegramId } = req.body;
    const user = db.prepare(`SELECT * FROM users WHERE telegramId=?`).get(telegramId);
    if (!user || user.zero_day_keys_balance <= 0) {
      return res.json({ success: false, error: 'no_keys' });
    }

    const draw = db.prepare(`SELECT * FROM draw_rounds WHERE status='active' ORDER BY id DESC LIMIT 1`).get();
    if (!draw) {
      return res.json({ success: false, error: 'draw_locked' });
    }

    let entry = db.prepare(`
      SELECT * FROM draw_entries WHERE draw_id=? AND telegramId=?
    `).get(draw.id, telegramId);

    const count = entry ? entry.entries : 0;
    if (count >= 2) {
      return res.json({ success: false, error: 'limit' });
    }

    db.prepare(`UPDATE users SET zero_day_keys_balance = zero_day_keys_balance - 1 WHERE telegramId=?`)
      .run(telegramId);

    if (!entry) {
      db.prepare(`
        INSERT INTO draw_entries (draw_id, telegramId, entries, createdAt, updatedAt)
        VALUES (?, ?, 1, ?, ?)
      `).run(draw.id, telegramId, Date.now(), Date.now());
    } else {
      db.prepare(`
        UPDATE draw_entries SET entries = entries + 1, updatedAt=? WHERE id=?
      `).run(Date.now(), entry.id);
    }
    recalcDrawScore(db, telegramId);

    res.json({
      success: true,
      draw_id: draw.id,
      entered: count + 1,
      max: 2
    });
  } catch (e) {
    console.error('DRAW ENTER ERROR:', e);
    res.json({ success: false, error: 'draw_enter_failed' });
  }
});

// STATUS
app.post('/api/draw/status', (req, res) => {
  try {
    const { telegramId } = req.body;

    const activeDraw = db.prepare(`SELECT * FROM draw_rounds WHERE status='active' ORDER BY id DESC LIMIT 1`).get();
    const latestDraw = activeDraw || db.prepare(`SELECT * FROM draw_rounds ORDER BY id DESC LIMIT 1`).get();

    const draw = latestDraw || null;
    const roundStatus = draw?.status || 'locked';

    let entry = null;
    if (activeDraw) {
      entry = db.prepare(`
        SELECT * FROM draw_entries WHERE draw_id=? AND telegramId=?
      `).get(activeDraw.id, telegramId);
    }

    const user = db.prepare(`SELECT zero_day_keys_balance FROM users WHERE telegramId=?`)
      .get(telegramId);

    const poolState =
      roundStatus === 'active'
        ? 'charging'
        : roundStatus === 'locked'
          ? 'locked_ready_for_drop'
          : 'completed';

    res.json({
      success: true,
      draw_id: draw?.id || null,
      round_status: roundStatus,
      pool_state: poolState,
      keys: user?.zero_day_keys_balance || 0,
      entered: entry?.entries || 0,
      max: 2
    });
  } catch (e) {
    console.error('DRAW STATUS ERROR:', e);
    res.json({ success: false, error: 'draw_status_failed' });
  }
});

// ===== USER LIVE SCORE (LIGHT ENDPOINT) =====
app.post('/api/user/score', (req, res) => {
  try {
    const { telegramId } = req.body;

    if (!telegramId) {
      return res.json({ success: false, error: 'no_telegram_id' });
    }

    const drawId = ensureActiveDrawId(db);

    const stats = ensureDrawUserStats(db, drawId, telegramId) || {
      taps_round: 0,
      ads_round: 0,
      refs_round: 0,
      donation_ton_round: 0,
      stars_round: 0,
      entries: 0,
      eligible: 0,
      score_cached: 0
    };

    const entryRow = db.prepare(`
      SELECT entries
      FROM draw_entries
      WHERE draw_id = ? AND telegramId = ?
      LIMIT 1
    `).get(drawId, telegramId) || { entries: 0 };

    function norm(x, s) {
      const value = Math.max(0, Number(x || 0));
      const scale = Math.max(0.000001, Number(s || 1));
      return 1 - Math.exp(-value / scale);
    }

    const drawEntries = Number(entryRow.entries || 0);
    const eligible = drawEntries > 0 ? 1 : 0;

    let keyProgress = 0;
    if (drawEntries === 1) keyProgress = 0.60;
    else if (drawEntries >= 2) keyProgress = 1.00;

    const multipliers = {
      K: 1 + 2.0 * keyProgress,
      R: 1 + 1.6 * norm(stats.refs_round, 3),
      T: 1 + 1.5 * norm(stats.donation_ton_round, 1.5),
      S: 1 + 1.25 * norm(stats.stars_round, 1000),
      A: 1 + 1.2 * norm(stats.ads_round, 20),
      P: 1 + 1.1 * norm(stats.taps_round, 5000)
    };

    const score = eligible
      ? Math.round(
          100 *
          multipliers.K *
          multipliers.R *
          multipliers.T *
          multipliers.S *
          multipliers.A *
          multipliers.P * 1000
        ) / 1000
      : 0;

    res.json({
      success: true,
      score,
      eligible,
      multipliers: {
        K: +multipliers.K.toFixed(3),
        R: +multipliers.R.toFixed(3),
        T: +multipliers.T.toFixed(3),
        S: +multipliers.S.toFixed(3),
        A: +multipliers.A.toFixed(3),
        P: +multipliers.P.toFixed(3)
      }
    });

  } catch (e) {
    console.error('USER SCORE ERROR:', e);
    res.json({ success: false, error: 'user_score_failed' });
  }
});

// ===== USER LIVE SCORE (ULTRA LIGHT FAST ENDPOINT) =====
app.post('/api/user/live-score', (req, res) => {
  try {
    const { telegramId } = req.body;

    if (!telegramId) {
      return res.json({ success: false, error: 'no_telegram_id' });
    }

    const drawId = ensureActiveDrawId(db);

    const stats = db.prepare(`
      SELECT taps_round, ads_round, refs_round, donation_ton_round, stars_round, entries, eligible
      FROM draw_user_stats
      WHERE draw_id = ? AND telegramId = ?
      LIMIT 1
    `).get(drawId, telegramId) || {
      taps_round: 0,
      ads_round: 0,
      refs_round: 0,
      donation_ton_round: 0,
      stars_round: 0,
      entries: 0,
      eligible: 0
    };

    const drawEntries = Number(stats.entries || 0);
    const eligible = drawEntries > 0 ? 1 : 0;

    function norm(x, s) {
      const value = Math.max(0, Number(x || 0));
      const scale = Math.max(0.000001, Number(s || 1));
      return 1 - Math.exp(-value / scale);
    }

    let recomputedScore = 0;
    if (eligible) {
      const BASE = 100;

      let keyProgress = 0;
      if (drawEntries === 1) keyProgress = 0.60;
      else if (drawEntries >= 2) keyProgress = 1.00;

      const K = 1 + 2.0 * keyProgress;
      const R = 1 + 1.6 * norm(stats.refs_round, 3);
      const T = 1 + 1.5 * norm(stats.donation_ton_round, 1.5);
      const S = 1 + 1.25 * norm(stats.stars_round, 1000);
      const A = 1 + 1.2 * norm(stats.ads_round, 20);
      const P = 1 + 1.1 * norm(stats.taps_round, 5000);

      recomputedScore = BASE * K * R * T * S * A * P;
    }

    recomputedScore = Math.round(Number(recomputedScore) * 1000) / 1000;

    // лёгкая delta (без пересчёта формулы)
    const lastDelta = Number(
      stats.taps_round * 0.001 +
      stats.ads_round * 0.01
    ).toFixed(2);

    res.json({
      success: true,
      live_score: recomputedScore,
      score: {
        recomputed: recomputedScore
      },
      delta: Number(lastDelta),
      activity: {
        taps: stats.taps_round,
        ads: stats.ads_round,
        refs: stats.refs_round,
        stars: stats.stars_round
      }
    });

  } catch (e) {
    console.error('LIVE SCORE ERROR:', e);
    res.json({ success: false, error: 'live_score_failed' });
  }
});

// ===== DRAW CONTROL =====
app.post('/api/draw/lock', (req, res) => {
  try {
    const round = db.prepare(`SELECT * FROM draw_rounds WHERE status='active' ORDER BY id DESC LIMIT 1`).get();
    if (!round) {
      return res.json({ success: false, error: 'no_active_round' });
    }

    const now = Date.now();

    db.prepare(`
      UPDATE draw_rounds
      SET status='locked', closedAt=?
      WHERE id=?
    `).run(now, round.id);

    return res.json({ success: true });
  } catch (e) {
    console.error('draw lock error:', e);
    res.json({ success: false });
  }
});

app.post('/api/draw/complete', (req, res) => {
  try {
    const round = db.prepare(`SELECT * FROM draw_rounds WHERE status='locked' ORDER BY id DESC LIMIT 1`).get();
    if (!round) {
      return res.json({ success: false, error: 'no_locked_round' });
    }

    db.prepare(`
      UPDATE draw_rounds
      SET status='completed'
      WHERE id=?
    `).run(round.id);

    return res.json({ success: true });
  } catch (e) {
    console.error('draw complete error:', e);
    res.json({ success: false });
  }
});

app.post('/api/draw/start', (req, res) => {
  try {
    const active = db.prepare(`SELECT * FROM draw_rounds WHERE status='active'`).get();
    if (active) {
      return res.json({ success: false, error: 'active_exists' });
    }

    db.prepare(`
      INSERT INTO draw_rounds (status, createdAt)
      VALUES ('active', ?)
    `).run(Date.now());

    return res.json({ success: true });
  } catch (e) {
    console.error('draw start error:', e);
    res.json({ success: false });
  }
});

// ===== DRAW CONTROL END =====

app.get('/health', (req, res) => {
  return res.json({ ok: true });
});

// ===== START =====
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, '127.0.0.1', () => {
  console.log('🚀 WallBreaker backend OK');
});

// ====== STARS R3 CREATE ======
async function telegramBotApi(method, payload) {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload || {})
  });

  const data = await resp.json();
  if (!data?.ok) {
    throw new Error(data?.description || `Telegram API ${method} failed`);
  }
  return data.result;
}

app.post('/api/rank/buy-stars/create', requireTelegramAuth, async (req, res) => {
  try {
    const telegramUser = req.telegramUser;
    const rankId = Number(req.body?.rank_id);

    if (rankId !== 3) {
      return res.status(400).json({
        success: false,
        error: 'stars_only_r3_for_now'
      });
    }

    const amount = 50;
    const payload = `wb_r3_${telegramUser.id}_${Date.now()}`;

    const invoiceLink = await telegramBotApi('createInvoiceLink', {
      title: 'WallBreaker R3',
      description: 'R3 rank activation (7 days)',
      payload,
      currency: 'XTR',
      prices: [
        {
          label: 'R3 Rank',
          amount: amount
        }
      ]
    });

    return res.json({
      success: true,
      invoice_link: invoiceLink,
      payload
    });

  } catch (e) {
    console.error('stars create error:', e);
    return res.status(500).json({
      success: false,
      error: 'stars_create_failed'
    });
  }
});
// ====== END STARS ======


// ====== STARS WEBHOOK ======
db.exec(`
  CREATE TABLE IF NOT EXISTS star_rank_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId TEXT NOT NULL,
    rank_id INTEGER NOT NULL,
    amount_xtr INTEGER NOT NULL,
    invoice_payload TEXT NOT NULL UNIQUE,
    telegram_payment_charge_id TEXT,
    provider_payment_charge_id TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    paidAt INTEGER
  )
`);

app.post('/telegram/webhook', async (req, res) => {
  try {
    const update = req.body || {};

    if (update.pre_checkout_query) {
      const q = update.pre_checkout_query;

      await telegramBotApi('answerPreCheckoutQuery', {
        pre_checkout_query_id: q.id,
        ok: true
      });

      return res.json({ ok: true });
    }

    if (update.message && update.message.successful_payment) {
      const sp = update.message.successful_payment;
      const payload = String(sp.invoice_payload || '');
      const telegramId = String(update.message.from?.id || '');
      const now = Date.now();

      // Handle nickname stars payments
      if (payload.startsWith('wb_nick_')) {
        db.prepare(`
          INSERT OR IGNORE INTO star_nickname_payments (
            telegramId,
            amount_xtr,
            invoice_payload,
            telegram_payment_charge_id,
            provider_payment_charge_id,
            status,
            createdAt,
            updatedAt,
            paidAt
          ) VALUES (?, ?, ?, ?, ?, 'paid', ?, ?, ?)
        `).run(
          telegramId,
          Number(sp.total_amount || 0),
          payload,
          sp.telegram_payment_charge_id || null,
          sp.provider_payment_charge_id || null,
          now,
          now,
          now
        );

        return res.json({ ok: true });
      }

      // Handle rank stars payments
      db.prepare(`
        INSERT OR IGNORE INTO star_rank_payments (
          telegramId,
          rank_id,
          amount_xtr,
          invoice_payload,
          telegram_payment_charge_id,
          provider_payment_charge_id,
          status,
          createdAt,
          updatedAt,
          paidAt
        ) VALUES (?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?)
      `).run(
        telegramId,
        3,
        Number(sp.total_amount || 0),
        payload,
        sp.telegram_payment_charge_id || null,
        sp.provider_payment_charge_id || null,
        now,
        now,
        now
      );

      const user = db.prepare(`
        SELECT * FROM users WHERE telegramId = ?
      `).get(telegramId);

      if (user) {

        // ===== ADD STARS TO USER STATS =====
        try {
          const starsAmount = Number(sp.total_amount || 0);

          db.prepare(`
            UPDATE users
            SET star_spent_total = COALESCE(star_spent_total, 0) + ?
            WHERE telegramId = ?
          `).run(starsAmount, telegramId);

          const drawId = ensureActiveDrawId(db);
          const stats = ensureDrawUserStats(db, drawId, telegramId);
          if (stats) {
            db.prepare(`
              UPDATE draw_user_stats
              SET stars_round = COALESCE(stars_round, 0) + ?,
                  updatedAt = ?
              WHERE draw_id = ? AND telegramId = ?
            `).run(starsAmount, Date.now(), drawId, telegramId);
          }
        } catch (e) {
          console.error('star_spent_total update error:', e);
        }

        purchaseRank(db, user, 3, 'XTR');
        recalcDrawScore(db, telegramId);
      }

      return res.json({ ok: true });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('telegram webhook error:', e);
    return res.status(500).json({ ok: false });
  }
});
// ====== END STARS WEBHOOK ======


// ===== NICKNAME STARS PAYMENTS =====
db.prepare(`
  CREATE TABLE IF NOT EXISTS star_nickname_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId TEXT NOT NULL,
    amount_xtr INTEGER NOT NULL,
    invoice_payload TEXT NOT NULL UNIQUE,
    telegram_payment_charge_id TEXT,
    provider_payment_charge_id TEXT,
    status TEXT NOT NULL DEFAULT 'created',
    new_nickname TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    paidAt INTEGER
  )
`);

app.post('/api/nickname/buy-stars/create', requireTelegramAuth, async (req, res) => {
  try {
    const telegramUser = req.telegramUser;
    const amount = 50;
    const payload = `wb_nick_${telegramUser.id}_${Date.now()}`;

    const invoiceLink = await telegramBotApi('createInvoiceLink', {
      title: 'WallBreaker Nickname Change',
      description: 'Change your public nickname',
      payload,
      currency: 'XTR',
      prices: [
        {
          label: 'Nickname Change',
          amount: amount
        }
      ]
    });

    return res.json({
      success: true,
      invoice_link: invoiceLink,
      payload
    });

  } catch (e) {
    console.error('nickname stars create error:', e);
    return res.status(500).json({
      success: false,
      error: 'stars_create_failed'
    });
  }
});

app.post('/api/nickname/buy-stars/status', requireTelegramAuth, (req, res) => {
  try {
    const telegramUser = req.telegramUser;
    const payload = String(req.body?.payload || '').trim();

    if (!payload) {
      return res.status(400).json({
        success: false,
        error: 'missing_payload'
      });
    }

    const payment = db.prepare(`
      SELECT *
      FROM star_nickname_payments
      WHERE invoice_payload = ? AND telegramId = ?
      LIMIT 1
    `).get(payload, String(telegramUser.id));

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'payment_not_found'
      });
    }

    return res.json({
      success: true,
      payment: {
        status: String(payment.status || 'created'),
        payload: payment.invoice_payload,
        createdAt: Number(payment.createdAt || 0)
      }
    });
  } catch (e) {
    console.error('nickname stars status error:', e);
    return res.status(500).json({
      success: false,
      error: 'stars_status_failed'
    });
  }
});

app.post('/api/nickname/buy-stars/confirm', requireTelegramAuth, (req, res) => {
  try {
    const telegramUser = req.telegramUser;
    const payload = String(req.body?.payload || '').trim();
    const newNickname = String(req.body?.nickname || '').trim();

    if (!payload || !newNickname) {
      return res.status(400).json({
        success: false,
        error: 'missing_fields'
      });
    }

    const payment = db.prepare(`
      SELECT *
      FROM star_nickname_payments
      WHERE invoice_payload = ? AND telegramId = ?
      LIMIT 1
    `).get(payload, String(telegramUser.id));

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'payment_not_found'
      });
    }

    if (String(payment.status || '') !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'payment_not_paid'
      });
    }

    let user = getOrCreateUser(telegramUser);
    user = ensureUserNickname(user);

    if (!isNicknameValid(newNickname)) {
      return res.status(400).json({
        success: false,
        error: 'nickname_invalid'
      });
    }

    if (nicknameExists(newNickname, String(telegramUser.id))) {
      return res.status(400).json({
        success: false,
        error: 'nickname_taken'
      });
    }

    const now = Date.now();

    db.prepare(`
      UPDATE star_nickname_payments
      SET status = ?, new_nickname = ?, updatedAt = ?
      WHERE invoice_payload = ?
    `).run('confirmed', newNickname, now, payload);

    db.prepare(`
      UPDATE users
      SET public_nickname = ?,
          nickname_manual = 1,
          nickname_free_used = 1,
          nickname_updatedAt = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(newNickname, now, now, String(telegramUser.id));

    return res.json({
      success: true,
      public_nickname: newNickname,
      nickname_manual: 1,
      nickname_free_used: 1,
      mode: 'stars',
      price_stars: 50
    });
  } catch (e) {
    console.error('nickname stars confirm error:', e);
    return res.status(500).json({
      success: false,
      error: 'nickname_confirm_failed'
    });
  }
});
// ===== END NICKNAME STARS PAYMENTS =====


// ===== DRAW FINISH =====
db.prepare(`
CREATE TABLE IF NOT EXISTS draw_winners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_id INTEGER NOT NULL,
  telegramId TEXT NOT NULL,
  place INTEGER NOT NULL,
  reward REAL NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
)
`).run();

app.post('/api/draw/finish', async (req, res) => {
  try {
    const draw = db.prepare(`
      SELECT *
      FROM draw_rounds
      WHERE status = 'locked'
      ORDER BY id DESC
      LIMIT 1
    `).get();

    if (!draw) {
      return res.status(400).json({ success: false, error: 'no_locked_round' });
    }

    const winnersAlreadySaved = db.prepare(`
      SELECT COUNT(*) AS c
      FROM draw_winners
      WHERE draw_id = ?
    `).get(draw.id);

    if (Number(winnersAlreadySaved?.c || 0) > 0) {
      return res.status(400).json({ success: false, error: 'round_already_finished' });
    }

    const participants = db.prepare(`
      SELECT
        u.telegramId,
        COALESCE(u.draw_score_cached, 0) AS draw_score_cached,
        COALESCE(e.entries, 0) AS entries
      FROM users u
      JOIN draw_entries e ON e.telegramId = u.telegramId
      WHERE e.draw_id = ?
      ORDER BY draw_score_cached DESC, entries DESC, u.telegramId ASC
    `).all(draw.id);

    const now = Date.now();

    if (!participants.length) {
      const tx = db.transaction(() => {
        db.prepare(`
          UPDATE draw_rounds
          SET status = 'completed',
              closedAt = COALESCE(closedAt, ?)
          WHERE id = ?
        `).run(now, draw.id);

        const active = db.prepare(`
          SELECT id
          FROM draw_rounds
          WHERE status = 'active'
          ORDER BY id DESC
          LIMIT 1
        `).get();

        if (!active) {
          db.prepare(`
            INSERT INTO draw_rounds (status, createdAt)
            VALUES ('active', ?)
          `).run(now);
        }
      });

      tx();

      return res.json({
        success: true,
        draw_id: draw.id,
        winners_count: 0,
        total_pool: 0,
        winners: []
      });
    }

    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(donation_ton_total), 0) AS ton
      FROM users
    `).get() || {};

    const totalPool = Number((Number(totals.ton || 0) * 0.8).toFixed(6));
    const top = participants.slice(0, 25);
    const winners = [];

    function distribute(startIndex, endIndex, percent) {
      const slice = top.slice(startIndex, endIndex);
      if (!slice.length || percent <= 0 || totalPool <= 0) return;

      const bucket = totalPool * percent;
      const perUser = Number((bucket / slice.length).toFixed(6));

      for (let i = 0; i < slice.length; i += 1) {
        const u = slice[i];
        winners.push({
          telegramId: u.telegramId,
          place: startIndex + i + 1,
          reward: perUser,
          score: Number(u.draw_score_cached || 0)
        });
      }
    }

    distribute(0, 3, 0.4);
    distribute(3, 10, 0.4);
    distribute(10, 25, 0.2);

    const tx = db.transaction(() => {
      for (const w of winners) {
        db.prepare(`
          INSERT INTO draw_winners (
            draw_id,
            telegramId,
            place,
            reward,
            score,
            createdAt
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          draw.id,
          w.telegramId,
          w.place,
          w.reward,
          w.score,
          now
        );

        db.prepare(`
          UPDATE users
          SET ton_balance = COALESCE(ton_balance, 0) + ?,
              updatedAt = ?
          WHERE telegramId = ?
        `).run(w.reward, now, w.telegramId);
      }

      db.prepare(`
        UPDATE draw_rounds
        SET status = 'completed',
            closedAt = COALESCE(closedAt, ?)
        WHERE id = ?
      `).run(now, draw.id);

      const active = db.prepare(`
        SELECT id
        FROM draw_rounds
        WHERE status = 'active'
        ORDER BY id DESC
        LIMIT 1
      `).get();

      if (!active) {
        db.prepare(`
          INSERT INTO draw_rounds (status, createdAt)
          VALUES ('active', ?)
        `).run(now);
      }
    });

    tx();

    return res.json({
      success: true,
      draw_id: draw.id,
      winners_count: winners.length,
      total_pool: totalPool,
      winners
    });
  } catch (e) {
    console.error('draw finish error:', e);
    return res.status(500).json({ success: false, error: 'draw_finish_failed' });
  }
});
