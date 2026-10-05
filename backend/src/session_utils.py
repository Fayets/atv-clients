import base64
import hashlib
import hmac
import json
import time
from decouple import config

SESSION_COOKIE_NAME = "ecosystem_session"
SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600

# Segunda llave propia de atv-clients: además de la sesión del ecosystem pide una contraseña.
UNLOCK_COOKIE_NAME = "clients_unlock"
UNLOCK_MAX_AGE_SECONDS = 30 * 24 * 3600
# SHA-256 de la contraseña del panel; se puede pisar con CLIENTS_PASSWORD en el .env.
_PASSWORD_SHA256 = "8424c6f2b0bef5a5f06b788d5fd0a5d80bb9cb95c4bdebf7c7dc5ed2322e3b4d"

def _secret() -> bytes:
    value = config("ECOSYSTEM_SECRET", default="") or config("SECRET", default="")
    if not value:
        raise RuntimeError("ECOSYSTEM_SECRET (o SECRET) no configurado en .env")
    return value.encode("utf-8")

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


def check_panel_password(password: str) -> bool:
    plain = config("CLIENTS_PASSWORD", default="")
    if plain:
        return hmac.compare_digest(password.encode("utf-8"), plain.encode("utf-8"))
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return hmac.compare_digest(digest, _PASSWORD_SHA256)


def create_unlock_token(username: str) -> str:
    payload = json.dumps(
        {"u": username, "k": "unlock", "exp": int(time.time()) + UNLOCK_MAX_AGE_SECONDS},
        separators=(",", ":"),
    )
    sig = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}.{sig}".encode("utf-8")).decode("ascii")


def verify_unlock_token(token: str, username: str) -> bool:
    if not token:
        return False
    try:
        raw = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        payload, sig = raw.rsplit(".", 1)
        expected = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return False
        data = json.loads(payload)
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return False
    exp = data.get("exp")
    return (
        data.get("k") == "unlock"
        and data.get("u") == username
        and isinstance(exp, int)
        and exp >= int(time.time())
    )
