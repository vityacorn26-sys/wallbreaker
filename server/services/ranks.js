const {
  RANK_REWARDS,
  RANK_DURATION_DAYS
} = require('../config/game');

const RANK_DURATION_MS = RANK_DURATION_DAYS * 24 * 60 * 60 * 1000;

const RANK_PAYMENT_OPTIONS = {
  2: [{ currency: 'WBC', amount: 250000 }],
  3: [
    { currency: 'TON', amount: 0.5 },
    { currency: 'XTR', amount: 250 }
  ],
  4: [
    { currency: 'WBC', amount: 750000 },
    { currency: 'TON', amount: 1 }
  ],
  5: [
    { currency: 'WBC', amount: 1300000 },
    { currency: 'TON', amount: 2.5 }
  ]
};

function normalizeRankId(rankId) {
  const id = Number(rankId || 1);
  if (!Number.isInteger(id) || id < 1 || id > 5) return 1;
  return id;
}

function normalizeCurrency(currency) {
  return String(currency || '').trim().toUpperCase();
}

function getRewardForRank(rankId) {
  const id = normalizeRankId(rankId);
  return Number(RANK_REWARDS[id] || RANK_REWARDS[1] || 10);
}

function getPaymentOptions(rankId) {
  const id = normalizeRankId(rankId);
  return Array.isArray(RANK_PAYMENT_OPTIONS[id]) ? RANK_PAYMENT_OPTIONS[id] : [];
}

function getDefaultPaymentOption(rankId) {
  return getPaymentOptions(rankId)[0] || null;
}

function findPaymentOption(rankId, currency) {
  const cur = normalizeCurrency(currency);
  return getPaymentOptions(rankId).find(x => x.currency === cur) || null;
}

function isRankExpired(user) {
  const rankId = normalizeRankId(user?.rank_id);
  if (rankId <= 1) return false;
  const expiresAt = Number(user?.rank_expires_at || 0);
  if (!expiresAt) return true;
  return Date.now() >= expiresAt;
}

function expireRankIfNeeded(db, user) {
  const rankId = normalizeRankId(user?.rank_id);
  if (rankId <= 1) {
    return {
      changed: false,
      user: {
        ...user,
        rank_id: 1,
        rank: 1,
        rank_expires_at: 0
      }
    };
  }

  if (!isRankExpired(user)) {
    return {
      changed: false,
      user
    };
  }

  const now = Date.now();

  db.prepare(`
    UPDATE users
    SET rank_id = 1,
        rank = 1,
        rank_expires_at = 0,
        updatedAt = ?
    WHERE telegramId = ?
  `).run(now, user.telegramId);

  const freshUser = db.prepare(`
    SELECT * FROM users WHERE telegramId = ?
  `).get(user.telegramId);

  return {
    changed: true,
    user: freshUser
  };
}

function getUserBalance(user, currency) {
  const cur = normalizeCurrency(currency);
  if (cur === 'WBC') return Number(user?.wbc_balance || 0);
  if (cur === 'TON') return Number(user?.ton_balance || 0);
  if (cur === 'XTR') return Number.MAX_SAFE_INTEGER;
  return 0;
}

function purchaseRank(db, user, targetRankId, currency) {
  const rankId = normalizeRankId(targetRankId);

  if (rankId <= 1) {
    return { ok: false, error: 'Invalid rank' };
  }

  const payment = findPaymentOption(rankId, currency);
  if (!payment) {
    return { ok: false, error: 'Unsupported payment option' };
  }

  const currentBalance = getUserBalance(user, payment.currency);

  if (payment.currency !== 'XTR' && currentBalance < payment.amount) {
    return { ok: false, error: `Not enough ${payment.currency}` };
  }

  const now = Date.now();
  const expiresAt = now + RANK_DURATION_MS;

  if (payment.currency === 'WBC') {
    db.prepare(`
      UPDATE users
      SET balance = ?,
          wbc_balance = ?,
          rank_id = ?,
          rank = ?,
          rank_expires_at = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(
      currentBalance - payment.amount,
      currentBalance - payment.amount,
      rankId,
      rankId,
      expiresAt,
      now,
      user.telegramId
    );
  } else if (payment.currency === 'TON') {
    db.prepare(`
      UPDATE users
      SET ton_balance = ?,
          rank_id = ?,
          rank = ?,
          rank_expires_at = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(
      currentBalance - payment.amount,
      rankId,
      rankId,
      expiresAt,
      now,
      user.telegramId
    );
  } else if (payment.currency === 'XTR') {
    db.prepare(`
      UPDATE users
      SET rank_id = ?,
          rank = ?,
          rank_expires_at = ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(
      rankId,
      rankId,
      expiresAt,
      now,
      user.telegramId
    );
  } else {
    return { ok: false, error: 'Unsupported currency' };
  }

  const freshUser = db.prepare(`
    SELECT * FROM users WHERE telegramId = ?
  `).get(user.telegramId);

  return {
    ok: true,
    payment,
    user: freshUser
  };
}

module.exports = {
  RANK_DURATION_MS,
  RANK_PAYMENT_OPTIONS,
  normalizeRankId,
  normalizeCurrency,
  getRewardForRank,
  getPaymentOptions,
  getDefaultPaymentOption,
  findPaymentOption,
  isRankExpired,
  expireRankIfNeeded,
  getUserBalance,
  purchaseRank
};
