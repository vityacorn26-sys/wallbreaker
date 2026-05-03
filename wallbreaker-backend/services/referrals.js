const REF_LEVELS = [
  { level: 1, percent: 0.10 },
  { level: 2, percent: 0.05 },
  { level: 3, percent: 0.03 }
];
function isActiveReferrer(db, telegramId) {
  const user = db.prepare(`
    SELECT ads_total, wbc_balance, key_fragments
    FROM users
    WHERE telegramId = ?
  `).get(telegramId);

  if (!user) return false;

  // ===== ВАЖНО: ПОКА ЖЁСТКАЯ ЛОГИКА =====
  // активный = минимум 10 реклам

  return Number(user.ads_total || 0) >= 10;
}

function getReferralChain(db, telegramId) {
  const chain = [];
  let currentId = telegramId;

  for (let i = 0; i < REF_LEVELS.length; i++) {
    const user = db.prepare(`
      SELECT referrer_id
      FROM users
      WHERE telegramId = ?
    `).get(currentId);

    if (!user || !user.referrer_id) break;

    chain.push({
      level: i + 1,
      referrerId: user.referrer_id
    });

    currentId = user.referrer_id;
  }

  return chain;
}

function applyReferralRewardsForAd(db, sourceUser, baseRewardWbc) {
  const chain = getReferralChain(db, sourceUser.telegramId);
  const now = Date.now();

  const results = [];

  for (const entry of chain) {
    const isActive = isActiveReferrer(db, entry.referrerId);
    if (!isActive) continue;

    const cfg = REF_LEVELS.find(x => x.level === entry.level);
    if (!cfg) continue;

    const reward = Math.floor(baseRewardWbc * cfg.percent);
    if (reward <= 0) continue;

    // начисляем баланс рефереру
    db.prepare(`
      UPDATE users
      SET balance = balance + ?,
          wbc_balance = wbc_balance + ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(
      reward,
      reward,
      now,
      entry.referrerId
    );

    // логируем
    db.prepare(`
      INSERT INTO referral_rewards (
        source_telegramId,
        target_telegramId,
        level,
        base_reward_wbc,
        reward_wbc,
        source_type,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, 'ad_reward', ?)
    `).run(
      sourceUser.telegramId,
      entry.referrerId,
      entry.level,
      baseRewardWbc,
      reward,
      now
    );

    results.push({
      level: entry.level,
      referrerId: entry.referrerId,
      reward
    });
  }

  return results;
}

module.exports = {
  getReferralChain,
  applyReferralRewardsForAd,
  isActiveReferrer
};

function bindReferrerIfPossible(db, user, referrerIdRaw) {
  if (!referrerIdRaw) return { ok: false, reason: 'no_ref' };

  const referrerId = String(referrerIdRaw);
  const userId = String(user.telegramId);

  // нельзя самого себя
  if (referrerId === userId) {
    return { ok: false, reason: 'self_ref' };
  }

  // уже есть реферер — не даём менять
  if (user.referrer_id) {
    return { ok: false, reason: 'already_bound' };
  }

  // проверяем, что реферер существует
  const refUser = db.prepare(`
    SELECT telegramId
    FROM users
    WHERE telegramId = ?
  `).get(referrerId);

  if (!refUser) {
    return { ok: false, reason: 'ref_not_found' };
  }

  db.prepare(`
    UPDATE users
    SET referrer_id = ?
    WHERE telegramId = ?
  `).run(referrerId, userId);

  return { ok: true };
}

module.exports.bindReferrerIfPossible = bindReferrerIfPossible;

