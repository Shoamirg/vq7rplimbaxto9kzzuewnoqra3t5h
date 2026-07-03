"""One-shot bot configuration — safe to re-run (idempotent on Telegram's side).

Sets the bot's name, descriptions, slash commands, and (when a public HTTPS
Mini App URL is configured) the persistent **menu button** that launches the
Mini App. This is what turns "a web page" into a real Telegram product:

    Telegram → GarageOS bot → [Open Garage] → Mini App → Home

Run:  python setup_bot.py
"""
from __future__ import annotations

from api import call
from config import MINI_APP_URL, require_token

COMMANDS = [
    {"command": "start", "description": "Open my garage"},
    {"command": "help", "description": "How GarageOS works"},
]

SHORT_DESCRIPTION = "Your garage in your pocket — vehicle health, billing, messages and roadside help."
DESCRIPTION = (
    "GarageOS gives you direct access to your garage: your vehicles' certified "
    "health passport, upcoming service, invoices and estimates, a direct line to "
    "your advisor, and one-tap roadside assistance with live tracking."
)


def main() -> None:
    require_token()
    me = call("getMe")
    print(f"Bot: @{me['username']} (id {me['id']})")

    call("setMyCommands", commands=COMMANDS)
    print(f"  ✓ commands set: {', '.join('/' + c['command'] for c in COMMANDS)}")

    call("setMyShortDescription", short_description=SHORT_DESCRIPTION)
    call("setMyDescription", description=DESCRIPTION)
    print("  ✓ name/descriptions set")

    if MINI_APP_URL.startswith("https://"):
        call(
            "setChatMenuButton",
            menu_button={
                "type": "web_app",
                "text": "Open Garage",
                "web_app": {"url": MINI_APP_URL},
            },
        )
        print(f"  ✓ menu button -> Web App {MINI_APP_URL}")
    else:
        # Reset to the default so a stale/broken URL never lingers.
        call("setChatMenuButton", menu_button={"type": "commands"})
        print(
            "  ⚠ TELEGRAM_MINI_APP_URL is not an https URL — menu button left as "
            "commands.\n    Set TELEGRAM_MINI_APP_URL in garageos/.env to the public "
            "HTTPS URL of /mini\n    (a tunnel in dev, your domain in prod) and re-run "
            "to wire the launch button."
        )

    print("Done.")


if __name__ == "__main__":
    main()
