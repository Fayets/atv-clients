from datetime import date, datetime


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
