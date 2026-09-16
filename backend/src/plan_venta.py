"""Parsea el mensaje de venta (arreglo closer / Nick) y propone un plan de cuotas.

Requiere: precio total, cantidad de cuotas, monto por cuota, fecha de inicio,
y monto de seña o primer pago. Si falta alguno, no genera plan.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from calendar import monthrange

ZERO = Decimal("0.00")


def _parse_money(raw: str) -> Decimal | None:
    text = raw.strip().lower().replace(" ", "")
    text = text.replace("us$", "").replace("usd", "").replace("$", "")
    text = text.replace(".", "").replace(",", ".") if text.count(",") == 1 and text.count(".") > 1 else text
    # 10.000,50 (EU) vs 10,000.50 (US)
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text and "." not in text:
        parts = text.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    try:
        value = Decimal(text)
    except (InvalidOperation, ValueError):
        return None
    if value <= 0:
        return None
    return value.quantize(Decimal("0.01"))


def _parse_date(raw: str) -> date | None:
    raw = raw.strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y"):
        try:
            from datetime import datetime

            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _add_months(base: date, months: int) -> date:
    month = base.month - 1 + months
    year = base.year + month // 12
    month = month % 12 + 1
    day = min(base.day, monthrange(year, month)[1])
    return date(year, month, day)


@dataclass
class PlanParsed:
    total_usd: Decimal
    cantidad_cuotas: int
    monto_cuota_usd: Decimal
    fecha_inicio: date
    sena_usd: Decimal
    ok: bool
    faltantes: list[str]
    cuotas: list[dict]


def parse_mensaje_venta(texto: str | None) -> PlanParsed:
    faltantes: list[str] = []
    if not texto or not texto.strip():
        return PlanParsed(
            total_usd=ZERO,
            cantidad_cuotas=0,
            monto_cuota_usd=ZERO,
            fecha_inicio=date.today(),
            sena_usd=ZERO,
            ok=False,
            faltantes=["mensaje vacío"],
            cuotas=[],
        )

    raw = texto

    total = None
    m = re.search(
        r"(?:precio\s*total|total\s*(?:del\s*)?(?:programa|plan)?|ticket)\s*[:=]?\s*"
        r"(?:us\$|usd|\$)?\s*([\d.,]+)",
        raw,
        re.I,
    )
    if m:
        total = _parse_money(m.group(1))

    cantidad = None
    m = re.search(r"(\d+)\s*cuotas?", raw, re.I)
    if m:
        cantidad = int(m.group(1))
    else:
        m = re.search(r"cantidad\s*(?:de\s*)?cuotas?\s*[:=]?\s*(\d+)", raw, re.I)
        if m:
            cantidad = int(m.group(1))

    monto_cuota = None
    m = re.search(
        r"(?:monto\s*(?:por|de)\s*cuota|cuota\s*(?:de|por)?)\s*[:=]?\s*"
        r"(?:us\$|usd|\$)?\s*([\d.,]+)",
        raw,
        re.I,
    )
    if m:
        monto_cuota = _parse_money(m.group(1))
    else:
        m = re.search(r"([\d.,]+)\s*(?:us\$|usd|\$)?\s*(?:por|/)\s*cuota", raw, re.I)
        if m:
            monto_cuota = _parse_money(m.group(1))

    fecha_inicio = None
    m = re.search(
        r"(?:fecha\s*(?:de\s*)?inicio|inicio|arranca|empieza)\s*[:=]?\s*"
        r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})",
        raw,
        re.I,
    )
    if m:
        fecha_inicio = _parse_date(m.group(1))

    sena = None
    m = re.search(
        r"(?:seña|sena|primer\s*pago|upfront|adelanto)\s*[:=]?\s*"
        r"(?:us\$|usd|\$)?\s*([\d.,]+)",
        raw,
        re.I,
    )
    if m:
        sena = _parse_money(m.group(1))

    if total is None:
        faltantes.append("precio total")
    if cantidad is None:
        faltantes.append("cantidad de cuotas")
    if monto_cuota is None:
        faltantes.append("monto por cuota")
    if fecha_inicio is None:
        faltantes.append("fecha de inicio")
    if sena is None:
        faltantes.append("seña o primer pago")

    if faltantes:
        return PlanParsed(
            total_usd=total or ZERO,
            cantidad_cuotas=cantidad or 0,
            monto_cuota_usd=monto_cuota or ZERO,
            fecha_inicio=fecha_inicio or date.today(),
            sena_usd=sena or ZERO,
            ok=False,
            faltantes=faltantes,
            cuotas=[],
        )

    assert total is not None and cantidad is not None and monto_cuota is not None
    assert fecha_inicio is not None and sena is not None

    cuotas: list[dict] = []
    # Seña / primer pago en fecha de inicio.
    cuotas.append({
        "monto_usd": sena,
        "fecha_vence": fecha_inicio,
        "notas": "sena",
    })
    # Cuotas de venta: cantidad informada (además de la seña).
    for i in range(cantidad):
        cuotas.append({
            "monto_usd": monto_cuota,
            "fecha_vence": _add_months(fecha_inicio, i + 1),
            "notas": "cuota_venta",
        })

    return PlanParsed(
        total_usd=total,
        cantidad_cuotas=cantidad,
        monto_cuota_usd=monto_cuota,
        fecha_inicio=fecha_inicio,
        sena_usd=sena,
        ok=True,
        faltantes=[],
        cuotas=cuotas,
    )


def build_plan_cuotas(
    *,
    total_usd: Decimal,
    cantidad_cuotas: int,
    monto_cuota_usd: Decimal,
    fecha_inicio: date,
    sena_usd: Decimal,
) -> PlanParsed:
    """Arma el plan desde datos estructurados (formulario)."""
    faltantes: list[str] = []
    if total_usd is None or total_usd <= 0:
        faltantes.append("precio total")
    if not cantidad_cuotas or cantidad_cuotas < 1:
        faltantes.append("cantidad de cuotas")
    if monto_cuota_usd is None or monto_cuota_usd <= 0:
        faltantes.append("monto por cuota")
    if not fecha_inicio:
        faltantes.append("fecha de inicio")
    if sena_usd is None or sena_usd < 0:
        faltantes.append("seña o primer pago")

    if faltantes:
        return PlanParsed(
            total_usd=total_usd or ZERO,
            cantidad_cuotas=cantidad_cuotas or 0,
            monto_cuota_usd=monto_cuota_usd or ZERO,
            fecha_inicio=fecha_inicio or date.today(),
            sena_usd=sena_usd or ZERO,
            ok=False,
            faltantes=faltantes,
            cuotas=[],
        )

    total = Decimal(total_usd).quantize(Decimal("0.01"))
    monto_cuota = Decimal(monto_cuota_usd).quantize(Decimal("0.01"))
    sena = Decimal(sena_usd).quantize(Decimal("0.01"))
    cantidad = int(cantidad_cuotas)

    cuotas: list[dict] = []
    if sena > 0:
        cuotas.append({
            "monto_usd": sena,
            "fecha_vence": fecha_inicio,
            "notas": "sena",
        })
    for i in range(cantidad):
        # Si hay seña el día 0, la 1ª cuota de venta vence al mes siguiente.
        offset = i + (1 if sena > 0 else 0)
        cuotas.append({
            "monto_usd": monto_cuota,
            "fecha_vence": _add_months(fecha_inicio, offset) if offset else fecha_inicio,
            "notas": "cuota_venta",
        })

    return PlanParsed(
        total_usd=total,
        cantidad_cuotas=cantidad,
        monto_cuota_usd=monto_cuota,
        fecha_inicio=fecha_inicio,
        sena_usd=sena,
        ok=True,
        faltantes=[],
        cuotas=cuotas,
    )
