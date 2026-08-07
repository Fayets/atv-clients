#!/usr/bin/env python3
"""Normaliza notas de cuotas existentes al catálogo unificado."""

from pony.orm import db_session

from src.cuota_notas import CUOTA_NOTA_LABELS, normalizar_nota_cuota
from src.db import init_db
from src.models import Cuota


def main() -> None:
    init_db()
    actualizadas = 0
    with db_session:
        for cuota in Cuota.select():
            nueva = normalizar_nota_cuota(cuota.notas)
            if nueva and cuota.notas != nueva:
                label = CUOTA_NOTA_LABELS.get(nueva, nueva)
                print(f"  {cuota.id}: {cuota.notas!r} → {nueva} ({label})")
                cuota.notas = nueva
                actualizadas += 1
    print(f"\nListo: {actualizadas} cuotas actualizadas.")


if __name__ == "__main__":
    main()
