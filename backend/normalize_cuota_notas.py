#!/usr/bin/env python3
"""Normaliza notas de cuotas existentes al catálogo unificado."""

from pony.orm import db_session

from src.cuota_notas import CUOTA_NOTA_LABELS, canonicalizar_valor_notas
from src.db import init_db
from src.models import Cuota


def main() -> None:
    init_db()
    actualizadas = 0
    with db_session:
        for cuota in Cuota.select():
            nueva = canonicalizar_valor_notas(cuota.notas)
            if cuota.notas != nueva:
                primera = nueva.split("\n", 1)[0]
                label = CUOTA_NOTA_LABELS.get(primera, primera)
                print(f"  {cuota.id}: {cuota.notas!r} → {nueva!r} ({label})")
                cuota.notas = nueva
                actualizadas += 1
    print(f"\nListo: {actualizadas} cuotas actualizadas.")


if __name__ == "__main__":
    main()
