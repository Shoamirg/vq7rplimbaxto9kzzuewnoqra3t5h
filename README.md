# GarageOS

One repository for the whole GarageOS platform. Every part lives in its own
folder under `garageos/` and is deployed together with one Docker Compose file.

| Folder | What it is | Public address |
|---|---|---|
| `garageos/website` | Landing / marketing site (Next.js) | `https://garageos.uz` |
| `garageos/admin-dashboard` | Staff & platform dashboard (Next.js, BFF) | `https://app.garageos.uz` |
| `garageos/backend` | API (FastAPI, Postgres, Redis) | `https://app.garageos.uz/api/v1` (also `garageos.uz/api/v1` for installed mobile apps) |
| `garageos/flutter_app` | Mobile app (Flutter) | App stores / APK |
| `garageos/packages` | Shared design system | — |
| `garageos/telegram-bot` | Optional Telegram bot (`--profile telegram`) | — |
| `garageos/docker` | Dockerfiles and the Caddy reverse proxy config | — |

History: `garageos/website` was imported from `temurxon-abulqosimov/garageos-website`
with its full history; everything else comes from `Shoamirg/vq7rplimbaxto9kzzuewnoqra3t5h`.
`garageos/backend` is the canonical backend (`Shoamirg/Backend-repo` is an older export).

## How traffic reaches the server

```
Internet ──HTTPS──> Cloudflare Tunnel ──HTTP──> Caddy :80 on the server
                                                  ├─ garageos.uz      -> website   (+ /api/v1 -> backend)
                                                  └─ app.garageos.uz  -> dashboard (+ /api/v1 -> backend)
```

Both hostnames must be added as public hostnames on the Cloudflare Tunnel,
pointing at `http://localhost:80`. Unknown paths on `garageos.uz` (old
`/passport`, `/invoice`, `/mini`, `/dashboard` links) redirect to `app.garageos.uz`.

## Deploy on the Ubuntu server

The server keeps a checkout in `/opt/garageos`; secrets live only in
`/opt/garageos/garageos/.env.prod` (never committed — copy `.env.prod.example`).

```bash
cd /opt/garageos/garageos
git pull
python3 scripts/production_preflight.py --env-file .env.prod   # optional sanity check
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

`--env-file .env.prod` is required: without it Compose substitutes blank
database credentials and the backend cannot connect.

Workflow: change code locally → commit → push to `main` → run the deploy above.
Do not edit files directly on the server.
