"""The few Telegram Bot API calls the desktop app needs."""

import json
import urllib.error
import urllib.request


class TelegramError(Exception):
    pass


def call(token, method, **params):
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(params).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.load(resp)
    except urllib.error.HTTPError as e:
        body = json.load(e)
    except (urllib.error.URLError, TimeoutError) as e:
        raise TelegramError(f"Can't reach Telegram ({e}).") from e
    if not body.get("ok"):
        code = body.get("error_code")
        if code == 401:
            raise TelegramError("Telegram rejected the token. Copy it again from @BotFather.")
        if code == 409:
            raise TelegramError("Another program is reading this bot's messages (probably the old Waky bot). "
                                "Revoke the old token in @BotFather and use the new one.")
        raise TelegramError(body.get("description", "Telegram error"))
    return body["result"]


def find_chat(token):
    """Find the private chat of whoever last messaged the bot (you, after sending /start)."""
    me = call(token, "getMe")
    updates = call(token, "getUpdates", timeout=0, allowed_updates=["message"])
    for update in reversed(updates):
        chat = (update.get("message") or {}).get("chat") or {}
        if chat.get("type") == "private":
            return {"chat_id": chat["id"], "name": chat.get("first_name", ""), "bot": me["username"]}
    raise TelegramError(f"No message found. Open @{me['username']} in Telegram, send /start, then try again.")


def post_checkin(token, chat_id, text, previous_pin=None):
    """Send the check-in and pin it. The nag bot reads the pinned message to know you're up."""
    msg = call(token, "sendMessage", chat_id=chat_id, text=text)
    if previous_pin:
        try:
            call(token, "unpinChatMessage", chat_id=chat_id, message_id=previous_pin)
        except TelegramError:
            pass  # Already unpinned by hand; doesn't matter.
    call(token, "pinChatMessage", chat_id=chat_id, message_id=msg["message_id"], disable_notification=True)
    return msg["message_id"]
