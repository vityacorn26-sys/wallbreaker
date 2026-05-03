const MIN_WITHDRAW_TON = 2.5;

function isValidTonAddress(addr) {
  if (!addr || typeof addr !== 'string') return false;

  const value = addr.trim();
  if (value.length < 40 || value.length > 100) {
    return false;
  }

  return true;
}

function createWithdrawRequest(db, user, amountTon, wallet) {
  const amount = Number(amountTon);
  const walletValue = String(wallet || '').trim();

  if (!amount || amount <= 0) {
    return { ok: false, error: 'invalid_amount' };
  }

  if (amount < MIN_WITHDRAW_TON) {
    return { ok: false, error: 'min_amount', min: MIN_WITHDRAW_TON };
  }

  const currentTon = Number(user.ton_balance || 0);
  if (currentTon < amount) {
    return { ok: false, error: 'insufficient_balance' };
  }

  if (!isValidTonAddress(walletValue)) {
    return { ok: false, error: 'invalid_wallet' };
  }

  const existingPending = db.prepare(`
    SELECT id
    FROM withdraw_requests
    WHERE telegramId = ?
      AND status = 'pending'
    ORDER BY id DESC
    LIMIT 1
  `).get(user.telegramId);

  if (existingPending) {
    return { ok: false, error: 'pending_exists' };
  }

  const now = Date.now();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET ton_balance = ton_balance - ?,
          updatedAt = ?
      WHERE telegramId = ?
    `).run(amount, now, user.telegramId);

    const result = db.prepare(`
      INSERT INTO withdraw_requests (
        telegramId,
        amount,
        currency,
        wallet,
        status,
        createdAt
      ) VALUES (?, ?, ?, ?, 'pending', ?)
    `).run(
      user.telegramId,
      amount,
      'TON',
      walletValue,
      now
    );

    return {
      ok: true,
      requestId: result.lastInsertRowid,
      amount,
      wallet: walletValue
    };
  });

  return tx();
}

module.exports = {
  createWithdrawRequest,
  MIN_WITHDRAW_TON
};
