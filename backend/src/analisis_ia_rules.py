"""Reglas para mostrar solo Win y Upsell en GET /api/analisis/ia."""

CATEGORIAS_VISIBLES = frozenset({"win", "upsell"})


def filtrar_accionables(resultados: list[dict]) -> list[dict]:
    return [
        item for item in resultados
        if item.get("categoria") in CATEGORIAS_VISIBLES
    ]
