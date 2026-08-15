"""Catálogo unificado de notas/tipo de cuota."""

from datetime import date
from typing import Literal

CuotaNotaTipo = Literal["cuota_venta", "cuota_upsell", "cuota_recompra", "sena"]

TIPO_DEFAULT = "cuota_venta"

CUOTA_NOTA_LABELS: dict[str, str] = {
    "cuota_venta": "Cuota venta",
    "cuota_upsell": "Cuota upsell",
    "cuota_recompra": "Cuota recompra",
    "sena": "Seña",
}

CUOTA_NOTAS_VALIDAS = frozenset(CUOTA_NOTA_LABELS)

NOTAS_PROYECCION = frozenset({"cuota_upsell", "cuota_recompra"})
NOTAS_SIN_NUMERO = frozenset({"sena", "cuota_upsell", "cuota_recompra"})

_ALIASES: dict[str, str] = {
    "cuota": TIPO_DEFAULT,
    "venta": TIPO_DEFAULT,
    "cuota_venta": TIPO_DEFAULT,
    "upsell": "cuota_upsell",
    "cuota_upsell": "cuota_upsell",
    "recompra": "cuota_recompra",
    "cuota_recompra": "cuota_recompra",
    "renovacion": "cuota_recompra",
    "seña": "sena",
    "senia": "sena",
    "deposito": "sena",
    "ingreso": TIPO_DEFAULT,
    "ultima": TIPO_DEFAULT,
    "evento": TIPO_DEFAULT,
    "meta_20k": TIPO_DEFAULT,
    "otro": TIPO_DEFAULT,
}

_LEGACY_NOTA_MAP: dict[str, str] = {
    "1RA CUOTA BOOST": TIPO_DEFAULT,
    "1RA CUOTA MENTORIA": TIPO_DEFAULT,
    "1RA CUOTA ADVANTAGE": TIPO_DEFAULT,
    "CUOTA 1": TIPO_DEFAULT,
    "2DA CUOTA BOOST": TIPO_DEFAULT,
    "2DA CUOTA MENTORIA": TIPO_DEFAULT,
    "2DA CUOTA ADVANTAGE": TIPO_DEFAULT,
    "2DA CUOTA RENOVACION BOOST": TIPO_DEFAULT,
    "CUOTA 2": TIPO_DEFAULT,
    "3RA CUOTA BOOST": TIPO_DEFAULT,
    "3RA CUOTA MENTORIA": TIPO_DEFAULT,
    "CUOTA 3": TIPO_DEFAULT,
    "4TA CUOTA BOOST": TIPO_DEFAULT,
    "ULTIMA CUOTA BOOST": TIPO_DEFAULT,
    "ULTIMA CUOTA MENTORIA": TIPO_DEFAULT,
    "UPSELL": "cuota_upsell",
    "RENOVACION": "cuota_recompra",
    "RENOVACION BOOST": "cuota_recompra",
    "RENOVACION MENTORIA": "cuota_recompra",
    "PAGA EN EVENTO": TIPO_DEFAULT,
    "CUOTA HASTA COMPLETAR 20K": TIPO_DEFAULT,
    "CUOTA HASTA COMPLETATAR 20K": TIPO_DEFAULT,
    "SEÑA": "sena",
    "SENA": "sena",
    "CUOTA VENTA": TIPO_DEFAULT,
    "CUOTA UPSELL": "cuota_upsell",
    "CUOTA RECOMPRA": "cuota_recompra",
}


def _primera_linea(raw: str) -> str:
    return raw.strip().split("\n", 1)[0].strip()


def normalizar_nota_cuota(raw: str | None) -> str | None:
    if raw is None:
        return None
    texto = raw.strip()
    if not texto:
        return None
    primera = _primera_linea(texto)
    clave = primera.lower().replace(" ", "_")
    if clave in CUOTA_NOTAS_VALIDAS:
        return clave
    if clave in _ALIASES:
        return _ALIASES[clave]
    legacy = _LEGACY_NOTA_MAP.get(primera.upper())
    if legacy:
        return legacy
    if clave.startswith("cuota_") and clave[6:].isdigit():
        return TIPO_DEFAULT
    if clave == "cuota":
        return TIPO_DEFAULT
    return None


def canonicalizar_valor_notas(raw: str | None) -> str:
    """Deja solo un tipo válido en la primera línea; el resto de notas se conserva."""
    if raw is None or not str(raw).strip():
        return TIPO_DEFAULT
    texto = str(raw)
    primera, sep, resto = texto.partition("\n")
    clave = normalizar_nota_cuota(primera) or TIPO_DEFAULT
    if not sep:
        return clave
    return f"{clave}\n{resto}"


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
            if (normalizar_nota_cuota(c.notas) or TIPO_DEFAULT) not in NOTAS_SIN_NUMERO
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
    return "Cuota venta"


def es_primera_cuota(cuota, cuotas_cliente: list) -> bool:
    cobranza = _cuotas_cobranza_ordenadas(cuotas_cliente)
    return bool(cobranza) and cobranza[0].id == cuota.id


def es_venta_nueva(cuota, cuotas_cliente: list) -> bool:
    """Seña o cuota 1: ingreso de venta nueva. El resto de cuota venta son cuotas."""
    nota = normalizar_nota_cuota(cuota.notas)
    if nota == "sena":
        return True
    if nota in NOTAS_SIN_NUMERO:
        return False
    return es_primera_cuota(cuota, cuotas_cliente)
