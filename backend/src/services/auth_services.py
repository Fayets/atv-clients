from src.session_utils import verify_session_token


class AuthServices:
    def get_session(self, token: str | None) -> dict | None:
        username = verify_session_token(token or "")
        if not username:
            return None
        return {"username": username}
