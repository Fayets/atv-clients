from fastapi import APIRouter, HTTPException, Request
from decouple import config

from src.services.auth_services import AuthServices
from src.session_utils import SESSION_COOKIE_NAME

router = APIRouter()
service = AuthServices()
MOCK_AUTH = config("MOCK_AUTH", default=False, cast=bool)
MOCK_USER = config("MOCK_USER", default="franco")


@router.get("/session")
def get_session(request: Request):
    try:
        if MOCK_AUTH:
            session = service.get_session(request.cookies.get(SESSION_COOKIE_NAME))
            return session or {"username": MOCK_USER}
        session = service.get_session(request.cookies.get(SESSION_COOKIE_NAME))
        if not session:
            raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
        return session
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error al verificar sesión.")
