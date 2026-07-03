"""GarageOS Telegram bot — long-polling handler for /start and /help.

Keeps state to a minimum: the real product is the Mini App. The bot's job is to
be the doorway — greet the customer and hand them the launch button. When a
public Mini App URL is configured, /start ships an inline Web App button (and
the persistent menu button, set by setup_bot.py, does the same next to the
composer). Run:  python bot.py
"""
from __future__ import annotations

import time

from api import TelegramError, call, get_updates
from config import MINI_APP_URL, require_token

WELCOME = (
    "🚗 <b>Welcome to GarageOS</b>\n\n"
    "Your garage, in your pocket — your vehicle's certified health passport, "
    "invoices &amp; estimates, a direct line to your advisor, and one-tap roadside "
    "assistance.\n\nTap <b>Open Garage</b> below to get started."
)
HELP = (
    "<b>GarageOS</b>\n\n"
    "• <b>Home</b> — everything that needs you, at a glance\n"
    "• <b>Vehicles</b> — your Certified Vehicle Passport &amp; health\n"
    "• <b>Billing</b> — approve estimates, view invoices\n"
    "• <b>Messages</b> — talk to your advisor\n"
    "• <b>Roadside</b> — request help with live tracking\n\n"
    "Tap the <b>Open Garage</b> button to launch the app."
)


def _launch_markup() -> dict | None:
    if not MINI_APP_URL.startswith("https://"):
        return None
    return {"inline_keyboard": [[{"text": "🔧 Open Garage", "web_app": {"url": MINI_APP_URL}}]]}


def _reply(chat_id: int, text: str) -> None:
    markup = _launch_markup()
    extra = (
        text
        if markup
        else text + "\n\n<i>(The garage app isn't published yet — ask your garage for the link.)</i>"
    )
    call("sendMessage", chat_id=chat_id, text=extra, parse_mode="HTML", reply_markup=markup)


def handle(update: dict) -> None:
    message = update.get("message") or {}
    text = (message.get("text") or "").strip()
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if not chat_id:
        return
    if text.startswith("/start"):
        _reply(chat_id, WELCOME)
    elif text.startswith("/help"):
        _reply(chat_id, HELP)
    # Any other message: nudge them to launch the app.
    elif text:
        _reply(chat_id, "Tap <b>Open Garage</b> to manage your vehicles.")


def main() -> None:
    require_token()
    me = call("getMe")
    launch = "with Web App launch" if _launch_markup() else "WITHOUT a Mini App URL (set TELEGRAM_MINI_APP_URL)"
    print(f"@{me['username']} polling {launch}. Ctrl+C to stop.")
    offset: int | None = None
    while True:
        try:
            updates = get_updates(offset, timeout=25)
        except TelegramError as exc:
            print("poll error:", exc)
            time.sleep(3)
            continue
        for u in updates:
            offset = u["update_id"] + 1
            try:
                handle(u)
            except TelegramError as exc:
                print("handle error:", exc)


if __name__ == "__main__":
    main()
