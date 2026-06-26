from fastapi import APIRouter, HTTPException, Request

from src.services.auth_services import AuthServices
from src.session_utils import SESSION_COOKIE_NAME

router = APIRouter()
service = AuthServices()


@router.get("/session")
def get_session(request: Request):
    try:
        session = service.get_session(request.cookies.get(SESSION_COOKIE_NAME))
        if not session:
            raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
        return session
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error al verificar sesión.")
