const { Client } = require('pg');

async function main() {
  const c = new Client({
    host: 'localhost',
    port: 5432,
    user: 'aviator',
    password: 'aviator_secret',
    database: 'aviator',
  });
  await c.connect();

  const stuck = await c.query(
    `SELECT id, "userId", status, "remainingAmount" FROM practice_bets WHERE status IN ('ACTIVE', 'QUEUED')`,
  );
  console.log('stuck bets before:', stuck.rowCount);

  for (const r of stuck.rows) {
    const refund = Number(r.remainingAmount) || 0;
    if (refund > 0) {
      await c.query(
        `UPDATE users SET "virtualCredits" = "virtualCredits" + $1 WHERE id = $2`,
        [refund, r.userId],
      );
    }
    await c.query(
      `UPDATE practice_bets SET status = 'CANCELLED', queued = false, "remainingAmount" = 0 WHERE id = $1`,
      [r.id],
    );
  }

  await c.query(
    `UPDATE users SET "virtualCredits" = 10000 WHERE email = 'player@aviator.local'`,
  );

  const after = await c.query(
    `SELECT id FROM practice_bets WHERE status IN ('ACTIVE', 'QUEUED')`,
  );
  const bal = await c.query(
    `SELECT "virtualCredits" FROM users WHERE email = 'player@aviator.local'`,
  );
  console.log('stuck after:', after.rowCount);
  console.log('player balance:', bal.rows[0]?.virtualCredits);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
