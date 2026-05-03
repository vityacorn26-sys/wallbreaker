const DAY_MS = 24 * 60 * 60 * 1000;

function cleanupOldAdRewardEvents(db, days = 30) {
  const threshold = Date.now() - (days * DAY_MS);

  const result = db.prepare(`
    DELETE FROM ad_reward_events
    WHERE createdAt < ?
  `).run(threshold);

  return {
    ok: true,
    deleted: result.changes,
    threshold
  };
}

function getMaintenanceStats(db) {
  const adRewardEvents = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM ad_reward_events
  `).get();

  const withdrawRequests = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM withdraw_requests
  `).get();

  const referralRewards = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM referral_rewards
  `).get();

  const users = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM users
  `).get();

  return {
    ad_reward_events: adRewardEvents.cnt,
    withdraw_requests: withdrawRequests.cnt,
    referral_rewards: referralRewards.cnt,
    users: users.cnt
  };
}

module.exports = {
  cleanupOldAdRewardEvents,
  getMaintenanceStats
};
