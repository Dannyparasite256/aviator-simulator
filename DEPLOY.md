# Hosting Aviator Simulator

This guide covers the easiest ways to put the app online.

> **Note:** This is a **virtual-credit educational simulator**. Deploy responsibly and keep legal disclaimers visible.

---

## Option A — Docker on your PC / VPS (recommended)

### 1. Install Docker Desktop (Windows)

1. Download: https://www.docker.com/products/docker-desktop/
2. Install and **restart** your computer
3. Open Docker Desktop and wait until it says **Running**
4. In PowerShell:

```powershell
docker --version
docker compose version
```

### 2. Configure environment

From the project folder (`C:\Users\TECNO\Desktop\aviator`):

```powershell
copy .env.example .env
notepad .env
```

Set at least:

```env
PUBLIC_WEB_URL=http://localhost:3000
PUBLIC_API_URL=http://localhost:4000
POSTGRES_PASSWORD=pick-a-strong-password
JWT_SECRET=long-random-string-at-least-32-characters
JWT_REFRESH_SECRET=another-long-random-string-32-chars
DATABASE_URL=postgresql://aviator:pick-a-strong-password@postgres:5432/aviator?schema=public
CORS_ORIGIN=http://localhost:3000
```

For a real domain later:

```env
PUBLIC_WEB_URL=https://your-app.com
PUBLIC_API_URL=https://api.your-app.com
CORS_ORIGIN=https://your-app.com
```

### 3. Build and start

```powershell
cd C:\Users\TECNO\Desktop\aviator
docker compose up -d --build
```

### 4. Open the app

| Service | URL |
|---------|-----|
| Web | http://localhost:3000 |
| API | http://localhost:4000/api/health |
| API docs | http://localhost:4000/api/docs |

**Demo logins (seeded):**

- Player: `player@aviator.local` / `Player123!`
- Admin: `admin@aviator.local` / `Admin123!`

### Useful commands

```powershell
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose down
docker compose up -d --build
```

### VPS (DigitalOcean / Contabo / AWS EC2)

1. Create an Ubuntu 22.04 server
2. Install Docker: https://docs.docker.com/engine/install/ubuntu/
3. Clone/upload this project
4. Set `.env` with your public IP or domain:

```env
PUBLIC_WEB_URL=http://YOUR_SERVER_IP:3000
PUBLIC_API_URL=http://YOUR_SERVER_IP:4000
CORS_ORIGIN=http://YOUR_SERVER_IP:3000
```

5. Open firewall ports **3000** and **4000** (or put Nginx in front with HTTPS)
6. `docker compose up -d --build`

---

## Option B — Railway (easy cloud)

Railway can host Postgres + API + Web.

1. Create account: https://railway.app
2. New project → **Deploy from GitHub** (push this repo first)
3. Add services:
   - **PostgreSQL** plugin
   - **Redis** plugin (optional; API works without it)
   - **API** service (Dockerfile: `apps/api/Dockerfile`, root context)
   - **Web** service (Dockerfile: `apps/web/Dockerfile`, root context)
4. Set API env vars:

```env
DATABASE_URL=<from Railway Postgres>
REDIS_URL=<from Railway Redis if any>
JWT_SECRET=<random>
JWT_REFRESH_SECRET=<random>
CORS_ORIGIN=https://your-web.up.railway.app
PORT=4000
```

5. Set Web **build args / env**:

```env
NEXT_PUBLIC_API_URL=https://your-api.up.railway.app
NEXT_PUBLIC_WS_URL=https://your-api.up.railway.app
```

6. Redeploy after URLs are known (Next needs public API URL at **build** time).

---

## Option C — Render

1. https://render.com → New **PostgreSQL**
2. New **Web Service** for API (Docker, root dir, `apps/api/Dockerfile`)
3. New **Web Service** for Web (Docker, `apps/web/Dockerfile`)
4. Wire `DATABASE_URL`, JWT secrets, `CORS_ORIGIN`, `NEXT_PUBLIC_API_URL`

---

## HTTPS / domain (production)

Use **Nginx** or **Caddy** reverse proxy:

```
your-app.com      → web:3000
api.your-app.com  → api:4000
```

Then set:

```env
PUBLIC_WEB_URL=https://your-app.com
PUBLIC_API_URL=https://api.your-app.com
CORS_ORIGIN=https://your-app.com
```

Rebuild web after changing public API URL:

```powershell
docker compose up -d --build web
```

---

## Local without Docker (what you use now)

You already run:

- Postgres (local Windows service)
- API: `npm run start:dev -w @aviator/api`
- Web: `npm run dev -w @aviator/web`

That’s fine for development. For **hosting on the internet**, use Docker or a cloud platform above.

---

## Security checklist before public hosting

- [ ] Change all default passwords and JWT secrets
- [ ] Change demo admin password after first login
- [ ] Restrict CORS to your real web origin
- [ ] Do not expose Postgres port `5432` publicly if possible
- [ ] Keep the “virtual credits only” disclaimer
- [ ] Prefer HTTPS

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Web loads but API fails | `PUBLIC_API_URL` must be reachable **from the browser**, not `http://api:4000` |
| CORS errors | Set `CORS_ORIGIN` to your exact web URL |
| Blank / old web | Rebuild web after changing `NEXT_PUBLIC_*` |
| DB migrate fails | Check `DATABASE_URL` and Postgres health: `docker compose logs postgres` |
| Docker not found | Install Docker Desktop and restart PC |

---

## Need help choosing?

| Goal | Choose |
|------|--------|
| Run on this PC for demos | **Option A** Docker Desktop |
| Cheap always-on public URL | **Railway** or **Render** |
| Full control + domain | **VPS + Docker** |
