from fastapi import HTTPException, Request

from src.ecosystem_session import SESSION_COOKIE_NAME, verify_session_token


def get_current_user(request: Request) -> str:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    username = verify_session_token(token or "")
    if username is None:
        raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
    return username
