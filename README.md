# WOL Web Backend

Backend Coordinator untuk Remote Wake-on-LAN (WoL) berbasis HTTP poller. Dibangun dengan [Hono](https://hono.dev/), Node.js, Prisma ORM, dan PostgreSQL.

## Fitur
- Endpoint Polling Router (`GET /api/poll`) hemat resource & atomic state consumption.
- Endpoint Trigger Bangun (`POST /api/wake`) dengan proteksi password.
- Endpoint Status Live (`GET /api/status`) untuk memantau status heartbeat router (Online/Offline) dan riwayat log.
- Multi-stage Dockerfile yang siap di-deploy langsung di **Coolify**.

## Environment Variables

| Variable | Default | Deskripsi |
|---|---|---|
| `PORT` | `3000` | Port listen server |
| `WOL_TOKEN` | `wol-pc-kakarifki-12` | Token rahasia otentikasi router |
| `WEB_PASSWORD` | `Komputer-Kaka-12` | Password otentikasi web client |
| `CORS_ORIGIN` | `https://wakeonlan.kakarifki.web.id` | Domain frontend yang diizinkan |
| `DATABASE_URL` | - | Connection string PostgreSQL |

## Menjalankan di Lokal (Development)

1. Salin `.env.example` ke `.env`:
   ```bash
   cp .env.example .env
   ```
2. Pasang dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma Client & Sync DB:
   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```
4. Jalankan server mode dev:
   ```bash
   npm run dev
   ```

## Deploy di Coolify

1. Push folder ini ke repositori GitHub tersendiri (misal `wol-backend`).
2. Di Coolify, buat resource **New Application** dari git repository tersebut.
3. Hubungkan dengan database **PostgreSQL** di Coolify.
4. Set Environment Variables (`DATABASE_URL`, `WOL_TOKEN`, `WEB_PASSWORD`, `CORS_ORIGIN`).
5. Coolify akan otomatis mendeteksi `Dockerfile` dan menjalankan aplikasi pada domain `wol.kakarifki.web.id`.

