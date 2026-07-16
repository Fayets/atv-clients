from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from pony.orm import db_session, flush

from src.models import AnalisisCash
from src.schemas import AnalisisCashPatch

DEFAULT_ANALISIS = {
    "total_usd": Decimal("2432780"),
    "periodo": "Últimos 3 meses",
    "titulo": "Cash collected",
    "subtitulo": "Lo que generaron nuestros clientes",
    "historia": (
        "En los últimos 3 meses, los clientes de ATV generaron este resultado "
        "sumando el canal de wins, sus canales privados y el resto de la comunidad."
    ),
    "fuentes": "Canal de wins · Canales privados · Boost / Mentoría / Advantage",
}


def _to_dict(row: AnalisisCash) -> dict:
    return {
        "id": row.id,
        "total_usd": row.total_usd,
        "periodo": row.periodo,
        "titulo": row.titulo,
        "subtitulo": row.subtitulo,
        "historia": row.historia or "",
        "fuentes": row.fuentes or "",
        "updated_at": row.updated_at,
        "updated_by": row.updated_by,
    }


class AnalisisServices:
    def obtener(self) -> dict:
        with db_session:
            row = AnalisisCash.select().order_by(AnalisisCash.id).first()
            if not row:
                row = AnalisisCash(**DEFAULT_ANALISIS)
                flush()
            return _to_dict(row)

    def actualizar(self, patch: AnalisisCashPatch, username: str) -> dict:
        payload = patch.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar.")

        with db_session:
            row = AnalisisCash.select().order_by(AnalisisCash.id).first()
            if not row:
                row = AnalisisCash(**DEFAULT_ANALISIS)
                flush()

            for field, value in payload.items():
                if isinstance(value, str):
                    value = value.strip()
                setattr(row, field, value)

            row.updated_at = datetime.utcnow()
            row.updated_by = username
            flush()
            return _to_dict(row)
