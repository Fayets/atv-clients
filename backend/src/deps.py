from decouple import config
from fastapi import HTTPException, Request
from src.session_utils import SESSION_COOKIE_NAME, verify_session_token

ADMIN_API_KEY = config("ADMIN_API_KEY", default="")


def get_current_user(request: Request) -> str:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    username = verify_session_token(token or "")
    if not username:
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
    return username


def get_agent_auth(request: Request) -> None:
    key = request.headers.get("X-Agent-Key", "")
    if not ADMIN_API_KEY or key != ADMIN_API_KEY:
        raise HTTPException(status_code=401, detail="API key inválida o faltante.")
