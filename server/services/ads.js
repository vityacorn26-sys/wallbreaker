const {
  ADS_PER_CLAIM,
  ADS_HOUR_LIMIT,
  ADS_DAY_LIMIT,
  AD_REWARD_COOLDOWN_MS,
  MAX_ENERGY
} = require('../config/game');
const {
  applyReferralRewardsForAd
} = require('./referrals');

const DEFAULT_PROVIDER = 'monetag';
const DEFAULT_REWARD_WBC = 1500;

// мягкие/жёсткие лимиты можно потом двигать без ломки схемы
const SOFT_CLAIMS_DAY = 20;
const HARD_CLAIMS_DAY = 40;
const HARD_CLAIMS_HOUR = 8;

function getClaimLimits() {
  return {
    adsPerClaim: ADS_PER_CLAIM,
    adsHourLimit: ADS_HOUR_LIMIT,
    adsDayLimit: ADS_DAY_LIMIT,
    cooldownMs: AD_REWARD_COOLDOWN_MS,
    softClaimsDay: SOFT_CLAIMS_DAY,
    hardClaimsDay: HARD_CLAIMS_DAY,
    hardClaimsHour: HARD_CLAIMS_HOUR
  };
}

function getUserClaimCounts(user) {
  const adsPerClaim = ADS_PER_CLAIM || 1;

  return {
    claimsDay: Math.floor(Number(user?.ads_day || 0) / adsPerClaim),
    claimsHour: Math.floor(Number(user?.ads_hour || 0) / adsPerClaim)
  };
}

function canClaimAdReward(user, now = Date.now()) {
  const limits = getClaimLimits();
  const lastAdRewardAt = Number(user?.lastAdRewardAt || 0);

  if (lastAdRewardAt && (now - lastAdRewardAt) < limits.cooldownMs) {
    return {
      ok: false,
      code: 'cooldown',
      message: 'Cooldown active'
    };
  }

  const nextAdsDay = Number(user?.ads_day || 0) + limits.adsPerClaim;
  const nextAdsHour = Number(user?.ads_hour || 0) + limits.adsPerClaim;

  if (nextAdsHour > limits.adsHourLimit) {
    return {
      ok: false,
      code: 'hour_limit',
      message: 'Hourly ad limit reached'
    };
  }

  if (nextAdsDay > limits.adsDayLimit) {
    return {
      ok: false,
      code: 'day_limit',
      message: 'Daily ad limit reached'
    };
  }

  const counts = getUserClaimCounts(user);
  const nextClaimsDay = counts.claimsDay + 1;
  const nextClaimsHour = counts.claimsHour + 1;

  if (nextClaimsHour > limits.hardClaimsHour) {
    return {
      ok: false,
      code: 'hard_claims_hour',
      message: 'Too many ad claims this hour'
    };
  }

  if (nextClaimsDay > limits.hardClaimsDay) {
    return {
      ok: false,
      code: 'hard_claims_day',
      message: 'Too many ad claims today'
    };
  }

  return {
    ok: true,
    code: nextClaimsDay > limits.softClaimsDay ? 'soft_limit_zone' : 'ok',
    message: 'Allowed',
    limits,
    counts: {
      ...counts,
      nextClaimsDay,
      nextClaimsHour
    }
  };
}

function logAdRewardEvent(db, {
  telegramId,
  provider = DEFAULT_PROVIDER,
  claimAdsCount = ADS_PER_CLAIM,
  rewardWbc = 0,
  status = 'pending',
  reason = ''
}) {
  const now = Date.now();

  const info = db.prepare(`
    INSERT INTO ad_reward_events (
      telegramId, provider, claim_ads_count, reward_wbc, status, reason, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(telegramId),
    String(provider),
    Number(claimAdsCount),
    Number(rewardWbc),
    String(status),
    String(reason),
    now
  );

  return info.lastInsertRowid;
}

function applyAdReward(db, user, {
  provider = DEFAULT_PROVIDER,
  rewardWbc = DEFAULT_REWARD_WBC
} = {}) {
  const now = Date.now();
  const check = canClaimAdReward(user, now);
  if (!check.ok) {
    logAdRewardEvent(db, {
      telegramId: user.telegramId,
      provider,
      claimAdsCount: ADS_PER_CLAIM,
      rewardWbc: 0,
      status: "rejected",
      reason: check.code
    });
    return { ok: false, error: check.code, message: check.message };
  }
  db.prepare(`
    UPDATE users
    SET wbc_balance = COALESCE(wbc_balance, 0) + ?,
        energy = COALESCE(energy, 0) + ?,
        ads_day = COALESCE(ads_day, 0) + ?,
        ads_hour = COALESCE(ads_hour, 0) + ?,
        lastAdRewardAt = ?,
        updatedAt = ?
    WHERE telegramId = ?
  `).run(
    rewardWbc,
    MAX_ENERGY,
    ADS_PER_CLAIM,
    ADS_PER_CLAIM,
    now,
    now,
    user.telegramId
  );
  const freshUser = db.prepare(`SELECT * FROM users WHERE telegramId = ?`).get(user.telegramId);
  logAdRewardEvent(db, {
    telegramId: user.telegramId,
    provider,
    claimAdsCount: ADS_PER_CLAIM,
    rewardWbc,
    status: check.code === "soft_limit_zone" ? "rewarded_soft" : "rewarded",
    reason: check.code
  });
  const { isActiveReferrer } = require('./referrals');
  const referralRewards = applyReferralRewardsForAd(db, freshUser, rewardWbc);
  return { ok: true, user: freshUser, meta: { provider, rewardWbc, adsPerClaim: ADS_PER_CLAIM, checkCode: check.code, referralRewards } };
}
module.exports = {
  DEFAULT_PROVIDER,
  DEFAULT_REWARD_WBC,
  getClaimLimits,
  getUserClaimCounts,
  canClaimAdReward,
  logAdRewardEvent,
  applyAdReward
};
