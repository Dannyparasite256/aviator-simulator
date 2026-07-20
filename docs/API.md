# Aviator Simulator API

Base URL: `http://localhost:4000/api`  
Interactive docs: `http://localhost:4000/api/docs`

> Educational simulation only. No real-money gambling endpoints exist.

## Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Create practice user (10,000 virtual credits) |
| POST | `/auth/login` | — | Login → JWT access + refresh |
| POST | `/auth/refresh` | — | Refresh tokens |
| POST | `/auth/logout` | Bearer | Invalidate refresh token |

## Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/users/me` | Bearer | Profile + virtual credits |
| POST | `/users/me/reset-credits` | Bearer | Reset virtual credits to 10,000 |

## Practice (virtual credits only)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/practice/bets` | Bearer | Active/queued dual-slot bets |
| POST | `/practice/bet` | Bearer | Place/queue bet (`slot` 1\|2, optional auto cash-out) |
| POST | `/practice/cashout` | Bearer | Cash out slot (`fraction` for partial) |
| POST | `/practice/cancel` | Bearer | Cancel during WAITING/COUNTDOWN or queued |

## Fairness & Lab

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/fairness/verify` | — | Recompute crash from seeds |
| GET | `/fairness/rounds/:id/verify` | — | Verify completed round |
| POST | `/lab/strategy` | — | Strategy simulation |
| POST | `/lab/monte-carlo` | — | Monte Carlo ruin/EV |
| GET | `/lab/myths` | — | Myths vs math |
| GET | `/lab/theoretical` | — | Theoretical EV |
| GET | `/lab/session` | Bearer | Session report + equity |

## Rounds

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/rounds` | — | History list |
| GET | `/rounds/:id` | — | Detail + events |
| GET | `/rounds/:id/replay` | — | Replay samples |

## Stats & Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/stats/me` | Bearer | Personal practice stats |
| GET | `/stats/global` | — | Global simulation stats |
| POST | `/analytics/track` | Bearer | Client analytics event |
| GET | `/analytics/recent` | Admin | Recent analytics |

## Admin (role: ADMIN)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/rounds/active` | Live round state |
| GET | `/admin/metrics` | Server performance |
| GET/PATCH | `/admin/settings` | Simulation config |
| GET | `/admin/seeds` | Seed inspection |
| GET | `/admin/preview-crashes` | Upcoming crash points (debug only) |
| GET | `/admin/logs/export` | Export logs JSON |
| GET | `/admin/fairness/export` | Export fairness proofs |
| GET | `/admin/rtp` | Observed vs theoretical RTP |
| POST | `/admin/settings/scenario` | Apply edge scenario preset |
| CRUD | `/admin/sim-players` | Manage simulated players |
| GET | `/admin/rounds/:id/replay` | Admin replay |

## Socket.IO (`/game` namespace)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `round:state` | S→C | Full round state |
| `round:tick` | S→C | Multiplier / countdown tick (~16ms) |
| `round:crash` | S→C | Crash reveal + seed |
| `round:history` | S→C | Recent crashes |
| `sim:player:action` | S→C | Simulated player cash-out |
| `practice:bet` | C→S | Practice bet |
| `practice:cashout` | C→S | Practice cash-out |

Auth: pass JWT in `handshake.auth.token`.
