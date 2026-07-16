from fastapi import APIRouter, Depends, HTTPException

from src.deps import get_current_user
from src.schemas import AnalisisCashPatch, AnalisisCashResponse
from src.services.analisis_services import AnalisisServices

router = APIRouter()
service = AnalisisServices()


@router.get("", response_model=AnalisisCashResponse)
def obtener_analisis(_: str = Depends(get_current_user)):
    try:
        return service.obtener()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error al obtener el análisis.")


@router.patch("", response_model=AnalisisCashResponse)
def actualizar_analisis(body: AnalisisCashPatch, username: str = Depends(get_current_user)):
    try:
        return service.actualizar(body, username)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error al actualizar el análisis.")
