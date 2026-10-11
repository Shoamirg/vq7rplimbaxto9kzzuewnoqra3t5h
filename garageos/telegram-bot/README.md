# GarageOS Telegram bot

The doorway into the [Mini App](../admin-dashboard/app/mini). The bot greets the
customer and hands them the **Open Garage** launch button; the app itself is the
product.

```
Telegram → GarageOS bot → [Open Garage] → Mini App → Home
```

## Configuration

Secrets come from the shared `garageos/.env` (gitignored):

```
TELEGRAM_BOT_TOKEN=...            # already set (bot: @garageos1_bot)
TELEGRAM_MINI_APP_URL=https://... # public HTTPS URL where /mini is served
```

`TELEGRAM_MINI_APP_URL` must be **public HTTPS** — Telegram will not launch a Web
App from `http://localhost`. In local dev, expose the Next dev server (port 3000)
with a tunnel and point the app at `<tunnel>/mini`:

```bash
cloudflared tunnel --url http://localhost:3000     # or: ngrok http 3000
# then set TELEGRAM_MINI_APP_URL=https://<tunnel-host>/mini in garageos/.env
```

In production it's `https://garageos.uz/mini`.

## Run

Uses `httpx` only — the backend venv already has it.

```bash
cd telegram-bot

# 1) Configure the bot (commands, name, descriptions, menu button). Idempotent.
python setup_bot.py

# 2) Run the bot (long-polling; handles /start and /help).
python bot.py
```

`setup_bot.py` wires the persistent **menu button** to launch the Mini App when
`TELEGRAM_MINI_APP_URL` is https; otherwise it leaves the default and tells you
what to set. Re-run it whenever the URL changes.

## Verify the journey

1. Open Telegram → search **@garageos1_bot** → `/start`
2. Tap **Open Garage** (inline button, or the menu button by the composer)
3. The Mini App opens, verifies your Telegram identity against your customer
   profile, and lands you on **Home**.

> Security: the token is in plaintext in `.env`. Before any public launch,
> rotate it via **@BotFather → /revoke** and store the new one in a secret
> manager. Webhook mode (vs long-polling) is the production deployment — point
> `setWebhook` at an HTTPS endpoint that forwards updates to `handle()`.
