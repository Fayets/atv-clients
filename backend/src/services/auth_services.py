import time

from fastapi import HTTPException

from src.session_utils import (
    check_panel_password,
    create_unlock_token,
    verify_session_token,
    verify_unlock_token,
)


class AuthServices:
    def get_session(self, token: str | None, unlock_token: str | None = None) -> dict | None:
        username = verify_session_token(token or "")
        if not username:
            return None
        return {"username": username, "unlocked": verify_unlock_token(unlock_token or "", username)}

    def unlock(self, token: str | None, password: str) -> str:
        """Valida la contraseña del panel y devuelve el token de desbloqueo."""
        username = verify_session_token(token or "")
        if not username:
            raise HTTPException(status_code=401, detail="Sesión inválida o expirada.")
        if not check_panel_password(password or ""):
            time.sleep(1)  # frena el probar contraseñas a mano
            raise HTTPException(status_code=401, detail="Contraseña incorrecta.")
        return create_unlock_token(username)
