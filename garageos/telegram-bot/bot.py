"""GarageOS Telegram bot — long-polling handler for /start and /help.

Keeps state to a minimum: the real product is the Mini App. The bot's job is to
be the doorway — greet the customer and hand them the launch button. When a
public Mini App URL is configured, /start ships an inline Web App button (and
the persistent menu button, set by setup_bot.py, does the same next to the
composer). Run:  python bot.py
"""
from __future__ import annotations

import time

from api import BackendError, TelegramError, backend_ingest, call, get_updates
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


def _extract(message: dict) -> tuple[str | None, list[dict]]:
    """Pull the body + attachments out of a Telegram message.

    Caption doubles as the body for media messages. Photos arrive as a list of
    sizes — the last is the largest. Everything else maps to one attachment with
    the file_id the backend later resolves to bytes.
    """
    body = (message.get("caption") or message.get("text") or "").strip() or None
    atts: list[dict] = []
    if message.get("photo"):
        atts.append({"kind": "photo", "file_id": message["photo"][-1]["file_id"]})
    if message.get("voice"):
        v = message["voice"]
        atts.append({"kind": "voice", "file_id": v["file_id"],
                     "duration": v.get("duration"), "mime": v.get("mime_type")})
    if message.get("audio"):
        a = message["audio"]
        atts.append({"kind": "voice", "file_id": a["file_id"], "duration": a.get("duration"),
                     "mime": a.get("mime_type"), "file_name": a.get("file_name")})
    if message.get("video_note"):
        atts.append({"kind": "voice", "file_id": message["video_note"]["file_id"],
                     "duration": message["video_note"].get("duration"), "label": "Video note"})
    if message.get("document"):
        d = message["document"]
        atts.append({"kind": "document", "file_id": d["file_id"],
                     "file_name": d.get("file_name"), "mime": d.get("mime_type")})
    if message.get("video"):
        atts.append({"kind": "document", "file_id": message["video"]["file_id"],
                     "mime": message["video"].get("mime_type"), "file_name": "Video"})
    if message.get("location"):
        loc = message["location"]
        atts.append({"kind": "location", "lat": loc.get("latitude"), "lng": loc.get("longitude")})
    return body, atts


def handle(update: dict) -> None:
    message = update.get("message") or {}
    text = (message.get("text") or "").strip()
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if not chat_id:
        return
    if text.startswith("/start"):
        _reply(chat_id, WELCOME)
        return
    if text.startswith("/help"):
        _reply(chat_id, HELP)
        return

    # Any real content (text / photo / voice / document / location) is forwarded
    # to the garage's Inbox so an advisor sees and can act on it.
    telegram_id = (message.get("from") or {}).get("id")
    body, attachments = _extract(message)
    if telegram_id and (body or attachments):
        try:
            result = backend_ingest(
                {"telegram_id": telegram_id, "text": body, "attachments": attachments}
            )
        except BackendError as exc:
            print("ingest error:", exc)
            call("sendMessage", chat_id=chat_id,
                 text="⚠️ Couldn't reach your garage just now. Please try again in a moment.")
            return
        if result.get("linked"):
            call("sendMessage", chat_id=chat_id,
                 text="✅ Sent to your garage. You'll see their reply in the app.")
        else:
            _reply(chat_id,
                   "To message your garage, tap <b>Open Garage</b> and sign in first.")
        return

    # Nothing actionable (e.g. a sticker) — nudge to the app.
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
