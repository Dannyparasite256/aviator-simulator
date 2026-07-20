/**
 * End-to-end smoke test for all major simulator features.
 * Usage: node scripts/e2e-smoke.js
 */
const API = process.env.API_URL || 'http://localhost:4000/api';

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && data.message
        ? Array.isArray(data.message)
          ? data.message.join(', ')
          : data.message
        : res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

function ok(name) {
  console.log(`  ✓ ${name}`);
}
function fail(name, err) {
  console.error(`  ✗ ${name}: ${err.message || err}`);
}

async function main() {
  console.log('\n=== Aviator E2E Smoke ===\n');
  let passed = 0;
  let failed = 0;

  async function step(name, fn) {
    try {
      await fn();
      ok(name);
      passed++;
    } catch (e) {
      fail(name, e);
      failed++;
    }
  }

  await step('Health', async () => {
    const h = await req('/health');
    if (h.status !== 'ok' && h.db !== true) throw new Error(JSON.stringify(h));
  });

  let playerToken;
  let adminToken;
  let playerId;

  await step('Player login', async () => {
    const r = await req('/auth/login', {
      method: 'POST',
      body: { email: 'player@aviator.local', password: 'Player123!' },
    });
    playerToken = r.tokens.accessToken;
    playerId = r.user.id;
    if (!playerToken) throw new Error('no token');
    if (r.user.virtualCredits == null) throw new Error('no credits field');
  });

  await step('Admin login', async () => {
    const r = await req('/auth/login', {
      method: 'POST',
      body: { email: 'admin@aviator.local', password: 'Admin123!' },
    });
    adminToken = r.tokens.accessToken;
    if (r.user.role !== 'ADMIN') throw new Error('not admin');
  });

  await step('Users/me', async () => {
    const me = await req('/users/me', { token: playerToken });
    if (me.id !== playerId) throw new Error('id mismatch');
  });

  await step('Wallet + currencies', async () => {
    const cur = await req('/wallet/currencies');
    if (!Array.isArray(cur) || cur.length < 2) throw new Error('no currencies');
    const w = await req('/wallet', { token: playerToken });
    if (typeof w.virtualCredits !== 'number') throw new Error('no vc');
  });

  await step('List open bets (cleanup)', async () => {
    await req('/practice/bets', { token: playerToken });
  });

  let betId;
  await step('Place practice bet slot 1', async () => {
    // May queue if flying
    const b = await req('/practice/bet', {
      method: 'POST',
      token: playerToken,
      body: { amount: 25, slot: 1, queueIfClosed: true, autoCashOutAt: 1.5 },
    });
    if (!b.betId) throw new Error('no betId');
    betId = b.betId;
    if (!['ACTIVE', 'QUEUED'].includes(b.status)) throw new Error(`bad status ${b.status}`);
  });

  await step('Place practice bet slot 2', async () => {
    const b = await req('/practice/bet', {
      method: 'POST',
      token: playerToken,
      body: { amount: 15, slot: 2, queueIfClosed: true },
    });
    if (!b.betId) throw new Error('no betId');
  });

  await step('Cancel slot 2 if waiting/queued', async () => {
    try {
      await req('/practice/cancel', {
        method: 'POST',
        token: playerToken,
        body: { slot: 2 },
      });
    } catch (e) {
      // OK if already flying
      if (!String(e.message).includes('Cannot cancel') && !String(e.message).includes('No cancellable')) {
        throw e;
      }
    }
  });

  await step('Wallet deposit request', async () => {
    const r = await req('/wallet/requests', {
      method: 'POST',
      token: playerToken,
      body: {
        type: 'DEPOSIT',
        currencyCode: 'USD',
        amountCurrency: 1,
        note: 'e2e test deposit',
      },
    });
    if (r.status !== 'PENDING') throw new Error(r.status);
    globalThis.__depId = r.id;
  });

  await step('Admin approve deposit', async () => {
    const id = globalThis.__depId;
    if (!id) throw new Error('no deposit id');
    const r = await req(`/wallet/admin/requests/${id}/review`, {
      method: 'POST',
      token: adminToken,
      body: { decision: 'APPROVED' },
    });
    if (r.status !== 'APPROVED') throw new Error(r.status);
  });

  await step('Promo redeem (or already used)', async () => {
    try {
      await req('/wallet/promo/redeem', {
        method: 'POST',
        token: playerToken,
        body: { code: 'WELCOME500' },
      });
    } catch (e) {
      if (
        !String(e.message).includes('already') &&
        !String(e.message).includes('Invalid')
      ) {
        // create unique promo via admin
        const code = `E2E${Date.now().toString(36).toUpperCase()}`;
        await req('/wallet/admin/promos', {
          method: 'POST',
          token: adminToken,
          body: { code, bonusVc: 50, maxUses: 5 },
        });
        await req('/wallet/promo/redeem', {
          method: 'POST',
          token: playerToken,
          body: { code },
        });
      }
    }
  });

  await step('Fairness verify', async () => {
    const r = await req('/fairness/verify', {
      method: 'POST',
      body: {
        serverSeed: 'abc123seed',
        clientSeed: 'client',
        nonce: 1,
        houseEdgeBps: 300,
      },
    });
    if (typeof r.crashPoint !== 'number') throw new Error('no crash');
  });

  await step('Lab strategy', async () => {
    const r = await req('/lab/strategy', {
      method: 'POST',
      body: {
        type: 'fixed_cashout',
        baseBet: 10,
        cashOutAt: 2,
        bankroll: 1000,
        rounds: 50,
      },
    });
    if (r.finalBankroll == null) throw new Error('no result');
  });

  await step('Stats global', async () => {
    const r = await req('/stats/global');
    if (r.totalRounds == null) throw new Error('no stats');
  });

  await step('Rounds list', async () => {
    const r = await req('/rounds?limit=5');
    if (!r.items) throw new Error('no items');
  });

  await step('Admin metrics', async () => {
    const r = await req('/admin/metrics', { token: adminToken });
    if (r.uptimeSeconds == null) throw new Error('no metrics');
  });

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
