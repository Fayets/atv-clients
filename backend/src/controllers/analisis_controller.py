from fastapi import APIRouter, Depends, HTTPException

from src.deps import get_current_user
from src.schemas import AnalisisCashPatch, AnalisisCashResponse, AnalisisIAResponse
from src.services.analisis_services import AnalisisServices
from src.services import analisis_ia_services as analisis_ia_service

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


@router.get("/ia", response_model=AnalisisIAResponse)
def obtener_analisis_ia(_: str = Depends(get_current_user)):
    try:
        return analisis_ia_service.obtener_estado()
    except Exception:
        raise HTTPException(status_code=500, detail="Error al obtener el análisis IA.")


@router.post("/ia/ejecutar", response_model=AnalisisIAResponse)
def ejecutar_analisis_ia(_: str = Depends(get_current_user)):
    try:
        if analisis_ia_service.obtener_estado().get("en_ejecucion"):
            raise HTTPException(status_code=409, detail="Ya hay un análisis en ejecución.")
        return analisis_ia_service.ejecutar(origen="manual")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error al ejecutar el análisis IA.")
