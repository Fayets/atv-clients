"""Catálogo unificado de notas/tipo de cuota."""

from datetime import date
from typing import Literal

CuotaNotaTipo = Literal["sena", "cuota", "upsell", "recompra"]

CUOTA_NOTA_LABELS: dict[str, str] = {
    "sena": "Seña",
    "cuota": "Cuota",
    "upsell": "Upsell",
    "recompra": "Recompra",
}

CUOTA_NOTAS_VALIDAS = frozenset(CUOTA_NOTA_LABELS)

NOTAS_PROYECCION = frozenset({"recompra", "upsell"})
NOTAS_SIN_NUMERO = frozenset({"sena", "recompra", "upsell"})

_ALIASES: dict[str, str] = {
    "seña": "sena",
    "senia": "sena",
    "deposito": "sena",
    "ingreso": "cuota",
    "ultima": "cuota",
    "renovacion": "recompra",
    "evento": "cuota",
    "meta_20k": "cuota",
    "otro": "cuota",
}

_LEGACY_NOTA_MAP: dict[str, str] = {
    "1RA CUOTA BOOST": "cuota",
    "1RA CUOTA MENTORIA": "cuota",
    "1RA CUOTA ADVANTAGE": "cuota",
    "CUOTA 1": "cuota",
    "2DA CUOTA BOOST": "cuota",
    "2DA CUOTA MENTORIA": "cuota",
    "2DA CUOTA ADVANTAGE": "cuota",
    "2DA CUOTA RENOVACION BOOST": "cuota",
    "CUOTA 2": "cuota",
    "3RA CUOTA BOOST": "cuota",
    "3RA CUOTA MENTORIA": "cuota",
    "CUOTA 3": "cuota",
    "4TA CUOTA BOOST": "cuota",
    "ULTIMA CUOTA BOOST": "cuota",
    "ULTIMA CUOTA MENTORIA": "cuota",
    "UPSELL": "upsell",
    "RENOVACION": "recompra",
    "RENOVACION BOOST": "recompra",
    "RENOVACION MENTORIA": "recompra",
    "PAGA EN EVENTO": "cuota",
    "CUOTA HASTA COMPLETAR 20K": "cuota",
    "CUOTA HASTA COMPLETATAR 20K": "cuota",
    "SEÑA": "sena",
    "SENA": "sena",
}


def normalizar_nota_cuota(raw: str | None) -> str | None:
    if raw is None:
        return None
    texto = raw.strip()
    if not texto:
        return None
    clave = texto.lower().replace(" ", "_")
    if clave in CUOTA_NOTAS_VALIDAS:
        return clave
    if clave in _ALIASES:
        return _ALIASES[clave]
    legacy = _LEGACY_NOTA_MAP.get(texto.upper())
    if legacy:
        return legacy
    if clave.startswith("cuota_") and clave[6:].isdigit():
        return "cuota"
    if clave == "cuota":
        return "cuota"
    return None


def es_nota_proyeccion(raw: str | None) -> bool:
    clave = normalizar_nota_cuota(raw)
    return clave in NOTAS_PROYECCION if clave else False


def etiqueta_nota_cuota(raw: str | None) -> str | None:
    clave = normalizar_nota_cuota(raw)
    if not clave:
        return None
    return CUOTA_NOTA_LABELS.get(clave, clave)


def _cuotas_cobranza_ordenadas(cuotas_cliente: list) -> list:
    return sorted(
        [
            c
            for c in cuotas_cliente
            if (normalizar_nota_cuota(c.notas) or "cuota") not in NOTAS_SIN_NUMERO
        ],
        key=lambda c: (c.fecha_vence or date.max, c.id),
    )


def etiqueta_cuota_auto(cuota, cuotas_cliente: list) -> str:
    """Cuota 1, Cuota 2… según orden de vencimiento. Seña, upsell y recompra usan su label."""
    nota = normalizar_nota_cuota(cuota.notas)
    if nota in NOTAS_SIN_NUMERO:
        return CUOTA_NOTA_LABELS[nota]
    cobranza = _cuotas_cobranza_ordenadas(cuotas_cliente)
    for idx, c in enumerate(cobranza, start=1):
        if c.id == cuota.id:
            return f"Cuota {idx}"
    return "Cuota"
