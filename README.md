# Aviator Crash Game Simulator

> **Educational / Software Engineering Use Only**  
> This application is a **simulation**. It does **not** support real-money betting, deposits, withdrawals, or any form of gambling. All credits are virtual practice balances.

A high-performance crash-style game simulator built for learning real-time systems, GPU animation, clean architecture, and ops tooling.

## Features

- **144 FPS** GPU-accelerated canvas (PixiJS)
- Real-time multiplier graph & Socket.IO multiplayer simulation
- Animated aircraft, particles, countdown, auto-restart rounds
- **Practice mode** with virtual credits only
- Statistics dashboard, round history & replay
- Simulated player activity
- Auth + role-based access control (USER / ADMIN)
- Admin dashboard: rounds, performance, settings, seeds, debug crash preview, logs export, simulated players, metrics
- NestJS + PostgreSQL + Prisma + Redis
- Dockerized deployment
- Unit, integration, and e2e tests

## Tech Stack

| Layer    | Stack                                      |
|----------|--------------------------------------------|
| Frontend | Next.js, React 19, TypeScript, PixiJS, Tailwind CSS, GSAP |
| Backend  | NestJS, Socket.IO, Prisma, PostgreSQL, Redis |
| Ops      | Docker Compose, structured logging         |

## Quick Start (Docker)

```bash
docker compose up -d --build
```

| Service | URL                    |
|---------|------------------------|
| Web     | http://localhost:3000  |
| API     | http://localhost:4000  |
| API Docs| http://localhost:4000/api/docs |
| Postgres| localhost:5432         |
| Redis   | localhost:6379         |

**Default admin** (seeded):

- Email: `admin@aviator.local`
- Password: `Admin123!`

**Default demo user**:

- Email: `player@aviator.local`
- Password: `Player123!`

## Local Development

### Prerequisites

- Node.js 20+
- Docker (Postgres + Redis) or local instances

```bash
# Start infra
docker compose up -d postgres redis

# Install
npm install

# Env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# DB
npm run db:generate
npm run db:migrate
npm run db:seed

# Run
npm run dev
```

## Project Structure

```
aviator/
├── apps/
│   ├── api/                 # NestJS backend (Clean Architecture)
│   │   ├── src/
│   │   │   ├── domain/      # Entities, ports
│   │   │   ├── application/ # Use cases, game engine
│   │   │   ├── infrastructure/
│   │   │   └── presentation/# Controllers, gateways
│   │   └── prisma/
│   └── web/                 # Next.js frontend
│       ├── app/
│       ├── components/
│       ├── lib/
│       └── hooks/
├── packages/
│   └── shared/              # Shared TypeScript types & constants
├── docker-compose.yml
└── README.md
```

## Architecture

- **Clean Architecture** layers: Domain → Application → Infrastructure → Presentation
- **SOLID** modules for game engine, auth, admin, analytics
- Crash points derived from **HMAC-SHA256 seeds** (provably fair style, for simulation audit)
- Redis for ephemeral round state & pub/sub; Postgres for durable history & users

## API Overview

See OpenAPI at `/api/docs` when the API is running.

Key namespaces:

- `POST /api/auth/register|login|refresh`
- `GET  /api/users/me`
- `GET  /api/rounds|rounds/:id|rounds/:id/replay`
- `GET  /api/stats/me|stats/global`
- `GET  /api/admin/*` (ADMIN role)
- Socket.IO: `game` namespace — join, practice cashout, tick stream

## Testing

```bash
npm run test          # unit + integration
npm run test:e2e      # API e2e
```

## License

MIT — educational use. No real-money gambling features.
