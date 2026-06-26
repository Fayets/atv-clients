import base64
import hashlib
import hmac
import json
import time

from decouple import config

SESSION_COOKIE_NAME = "ecosystem_session"


def _secret() -> bytes:
    return config("ECOSYSTEM_SECRET", default="").encode("utf-8")


def verify_session_token(token: str) -> str | None:
    if not token:
        return None
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        payload, sig = raw.rsplit(".", 1)
    except (ValueError, UnicodeDecodeError):
        return None

    expected = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        return None

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return None

    exp = data.get("exp")
    username = data.get("u")
    if not isinstance(exp, int) or not isinstance(username, str) or exp < int(time.time()):
        return None
    return username
