"""Reporte semanal (Marketing y Ventas). Los datos vienen de ATV MKT."""

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response

from src.deps import get_current_user
from src.services import mkt_services

router = APIRouter()

_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _validar(desde: str, hasta: str) -> tuple[str, str]:
    for nombre, valor in (("desde", desde), ("hasta", hasta)):
        if not _FECHA.match((valor or "").strip()):
            raise HTTPException(status_code=400, detail=f"Parámetro {nombre} inválido (usar YYYY-MM-DD).")
    if hasta <= desde:
        raise HTTPException(status_code=400, detail="`hasta` debe ser posterior a `desde`.")
    return desde.strip(), hasta.strip()


@router.get("/contenido")
def contenido(
    _: str = Depends(get_current_user),
    desde: str = Query(description="YYYY-MM-DD, inclusive"),
    hasta: str = Query(description="YYYY-MM-DD, exclusive"),
) -> dict[str, Any]:
    d, h = _validar(desde, hasta)
    return mkt_services.get_contenido(d, h)


@router.get("/ventas")
def ventas(
    _: str = Depends(get_current_user),
    desde: str = Query(description="YYYY-MM-DD, inclusive"),
    hasta: str = Query(description="YYYY-MM-DD, exclusive"),
) -> dict[str, Any]:
    d, h = _validar(desde, hasta)
    return mkt_services.get_ventas(d, h)


@router.get("/media/{path:path}")
def media(path: str, _: str = Depends(get_current_user)) -> Response:
    """Sirve las imágenes de historias de MKT por HTTPS.

    MKT las expone por HTTP y Clients corre en HTTPS: sin este pase el navegador
    las bloquea por contenido mixto.
    """
    contenido, tipo = mkt_services.get_media(path)
    return Response(
        content=contenido,
        media_type=tipo,
        headers={"Cache-Control": "public, max-age=86400"},
    )
