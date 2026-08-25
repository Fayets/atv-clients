"""Cliente de lectura contra ATV MKT, para el reporte semanal.

ATV Clients no tiene los datos de marketing y ventas: viven en ATV MKT, que es
otro proyecto con su propia base de Neon. No hay JOIN posible entre las dos, así
que la única vía es HTTP.

Autentica con `X-Agent-Key` (la M2M que ya usa MKT para el bot). La key vive
solo acá, en el servidor: el navegador nunca la ve.

Se usa urllib de la stdlib a propósito, para no sumar dependencias al contenedor.
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from decouple import config
from fastapi import HTTPException

MKT_BASE_URL = config("MKT_BASE_URL", default="").strip().rstrip("/")
MKT_AGENT_KEY = config("MKT_AGENT_KEY", default="").strip()

_TIMEOUT = 30

# Las imágenes de historias las sirve MKT por HTTP. Como Clients corre en HTTPS,
# el navegador bloquearía esas cargas por contenido mixto: se reescriben para
# que pasen por este backend, que sí es HTTPS.
_MEDIA_PROXY_PREFIX = "/api/reportes/media/"


def _get(path: str, params: dict[str, str]) -> dict[str, Any]:
    if not MKT_BASE_URL or not MKT_AGENT_KEY:
        raise HTTPException(
            status_code=503,
            detail="ATV MKT no está configurado (faltan MKT_BASE_URL o MKT_AGENT_KEY).",
        )

    url = f"{MKT_BASE_URL}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"X-Agent-Key": MKT_AGENT_KEY})

    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detalle = "Error de ATV MKT."
        try:
            cuerpo = json.loads(e.read().decode("utf-8"))
            if isinstance(cuerpo, dict) and cuerpo.get("detail"):
                detalle = str(cuerpo["detail"])
        except Exception:
            pass
        if e.code == 401:
            detalle = "ATV MKT rechazó la API key."
        elif e.code == 404:
            detalle = "El endpoint de reportes no existe en ese ATV MKT."
        raise HTTPException(status_code=502, detail=detalle) from e
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail="No se pudo conectar con ATV MKT.") from e
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail="ATV MKT devolvió una respuesta inválida.") from e


def _reescribir_media(valor: Any) -> Any:
    """Reemplaza las URLs de /media de MKT por el proxy de este backend."""
    if isinstance(valor, str):
        marca = f"{MKT_BASE_URL}/media/"
        if MKT_BASE_URL and valor.startswith(marca):
            return _MEDIA_PROXY_PREFIX + valor[len(marca):]
        return valor
    if isinstance(valor, list):
        return [_reescribir_media(v) for v in valor]
    if isinstance(valor, dict):
        return {k: _reescribir_media(v) for k, v in valor.items()}
    return valor


def get_contenido(desde: str, hasta: str) -> dict[str, Any]:
    """Contenido publicado en [desde, hasta) con su cash y agendas."""
    return _reescribir_media(_get("/api/reportes/contenido", {"desde": desde, "hasta": hasta}))


def get_ventas(desde: str, hasta: str) -> dict[str, Any]:
    """Llamadas de la semana con atribución, estado y pago, más el funnel."""
    return _reescribir_media(_get("/api/reportes/ventas", {"desde": desde, "hasta": hasta}))


def get_media(path: str) -> tuple[bytes, str]:
    """Descarga un archivo de /media de MKT. Devuelve (bytes, content-type)."""
    if not MKT_BASE_URL:
        raise HTTPException(status_code=503, detail="ATV MKT no está configurado.")
    # solo archivos bajo /media: nada de subir de directorio ni apuntar a otro host
    limpio = path.strip().lstrip("/")
    if ".." in limpio or "//" in limpio or not limpio:
        raise HTTPException(status_code=400, detail="Ruta de archivo inválida.")

    url = f"{MKT_BASE_URL}/media/{urllib.parse.quote(limpio)}"
    req = urllib.request.Request(url, headers={"X-Agent-Key": MKT_AGENT_KEY})
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as res:
            return res.read(), res.headers.get("Content-Type", "application/octet-stream")
    except urllib.error.HTTPError as e:
        raise HTTPException(status_code=404 if e.code == 404 else 502, detail="No se pudo obtener la imagen.") from e
    except urllib.error.URLError as e:
        raise HTTPException(status_code=502, detail="No se pudo conectar con ATV MKT.") from e
