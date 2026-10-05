from fastapi import APIRouter, HTTPException, Request, Response
from decouple import config
from pydantic import BaseModel

from src.services.auth_services import AuthServices
from src.session_utils import SESSION_COOKIE_NAME, UNLOCK_COOKIE_NAME, UNLOCK_MAX_AGE_SECONDS

router = APIRouter()
service = AuthServices()
MOCK_AUTH = config("MOCK_AUTH", default=False, cast=bool)
MOCK_USER = config("MOCK_USER", default="franco")
COOKIE_SECURE = config("COOKIE_SECURE", default=not MOCK_AUTH, cast=bool)


class UnlockBody(BaseModel):
    password: str


@router.get("/session")
def get_session(request: Request):
    try:
        session = service.get_session(
            request.cookies.get(SESSION_COOKIE_NAME),
            request.cookies.get(UNLOCK_COOKIE_NAME),
        )
        if MOCK_AUTH:
            return session or {"username": MOCK_USER, "unlocked": True}
        if not session:
            raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
        return session
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error al verificar sesión.")


@router.post("/unlock")
def unlock(body: UnlockBody, request: Request, response: Response):
    token = service.unlock(request.cookies.get(SESSION_COOKIE_NAME), body.password)
    response.set_cookie(
        UNLOCK_COOKIE_NAME,
        token,
        max_age=UNLOCK_MAX_AGE_SECONDS,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        path="/",
    )
    return {"ok": True}
