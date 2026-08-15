from datetime import date, datetime, timedelta

import pytz

AR = pytz.timezone("America/Argentina/Buenos_Aires")


def format_fecha_ar(value: date | datetime | None) -> str:
    if not value:
        return "—"
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%d/%m/%Y")


def format_fecha_hora_ar(value: datetime | None) -> str:
    if not value:
        return "—"
    return value.strftime("%d/%m/%Y %H:%M")


def _a_hora_ar(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = pytz.UTC.localize(value)
    return value.astimezone(AR)


def label_actualizacion_caja(value: datetime | None) -> str | None:
    if not value:
        return None
    local = _a_hora_ar(value)
    hoy = datetime.now(AR).date()
    hora = f"{local.hour}:{local.minute:02d}"
    if local.date() == hoy:
        return f"Actualizado hoy {hora}"
    if local.date() == hoy - timedelta(days=1):
        return f"Actualizado ayer {hora}"
    return f"Actualizado el {local.strftime('%d/%m')} {hora}"
