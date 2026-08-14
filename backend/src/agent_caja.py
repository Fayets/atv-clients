from __future__ import annotations

import calendar
import re
from datetime import date, datetime
from decimal import Decimal

import pytz
from fastapi import HTTPException
from pony.orm import db_session

from src.cuota_notas import normalizar_nota_cuota
from src.models import Cliente, Cuota

AR = pytz.timezone("America/Argentina/Buenos_Aires")
MONTH_RE = re.compile(r"^(\d{4})-(\d{2})$")


def today_ar() -> date:
    return datetime.now(AR).date()


def parse_month(month: str | None) -> tuple[int, int, str]:
    if month is None:
        hoy = today_ar()
        return hoy.year, hoy.month, f"{hoy.year:04d}-{hoy.month:02d}"
    match = MONTH_RE.match(month.strip())
    if not match:
        raise HTTPException(status_code=400, detail="month debe tener formato YYYY-MM.")
    anio, mes = int(match.group(1)), int(match.group(2))
    if mes < 1 or mes > 12:
        raise HTTPException(status_code=400, detail="Mes inválido.")
    return anio, mes, f"{anio:04d}-{mes:02d}"


def fin_de_mes(anio: int, mes: int) -> date:
    return date(anio, mes, calendar.monthrange(anio, mes)[1])


def inicio_de_mes(anio: int, mes: int) -> date:
    return date(anio, mes, 1)


def cuota_tipo(cuota: Cuota) -> str:
    return normalizar_nota_cuota(cuota.notas) or "cuota_venta"


def monto_usd_redondeado(value: Decimal | None) -> float:
    amount = value if value is not None else Decimal("0")
    return float(amount.quantize(Decimal("0.01")))


def _matches_tipo(cuota: Cuota, tipo: str | None) -> bool:
    if tipo is None:
        return True
    return cuota_tipo(cuota) == tipo


def _filtrar_cuotas_cobros(
    cuotas: list[Cuota],
    anio: int,
    mes: int,
    *,
    arrastre: bool,
) -> list[Cuota]:
    fin = fin_de_mes(anio, mes)
    if arrastre:
        return [cuota for cuota in cuotas if cuota.fecha_vence <= fin]
    inicio = inicio_de_mes(anio, mes)
    return [cuota for cuota in cuotas if inicio <= cuota.fecha_vence <= fin]


def build_cobros_item(cuota: Cuota, mes_consulta_inicio: date, clientes: dict[int, Cliente]) -> dict:
    fv = cuota.fecha_vence
    cliente = clientes[cuota.cliente.id]
    return {
        "cliente_id": cliente.id,
        "cliente_nombre": cliente.nombre,
        "monto_usd": monto_usd_redondeado(cuota.monto_usd),
        "fecha_vence": fv,
        "mes_vencimiento": f"{fv.year:04d}-{fv.month:02d}",
        "es_arrastre": fv < mes_consulta_inicio,
        "estado": cuota.estado,
        "tipo": cuota_tipo(cuota),
    }


def build_proyeccion_item(cuota: Cuota, clientes: dict[int, Cliente]) -> dict:
    cliente = clientes[cuota.cliente.id]
    return {
        "cliente_id": cliente.id,
        "cliente_nombre": cliente.nombre,
        "monto_usd": monto_usd_redondeado(cuota.monto_usd),
        "fecha_vence": cuota.fecha_vence,
        "estado": cuota.estado,
    }


def _grupo_proyeccion(cuotas: list[dict]) -> dict:
    monto = round(sum(item["monto_usd"] for item in cuotas), 2)
    return {
        "cantidad": len(cuotas),
        "monto_usd": monto,
        "cuotas": cuotas,
    }


def _grupo_cobros_detalle(filas: list[dict]) -> dict:
    total = round(sum(item["monto_usd"] for item in filas), 2)
    return {
        "total_usd": total,
        "cantidad": len(filas),
        "detalle": filas,
    }


def _respuesta_cobros_arrastre(
    mes_label: str,
    filas: list[dict],
) -> dict:
    cuotas_filas = [fila for fila in filas if fila["tipo"] in {"cuota_venta", "sena"}]
    proyeccion_filas = [fila for fila in filas if fila["tipo"] in {"cuota_recompra", "cuota_upsell"}]
    grupo_cuotas = _grupo_cobros_detalle(cuotas_filas)
    grupo_proyeccion = _grupo_cobros_detalle(proyeccion_filas)
    return {
        "mes": mes_label,
        "cuotas": grupo_cuotas,
        "recompras_upsells": grupo_proyeccion,
        "total_general_usd": round(grupo_cuotas["total_usd"] + grupo_proyeccion["total_usd"], 2),
    }


def obtener_cobros(
    month: str | None,
    *,
    arrastre: bool = False,
    tipo: str | None = None,
) -> dict:
    return _obtener_cobros_db(month, arrastre=arrastre, tipo=tipo)


@db_session
def _obtener_cobros_db(
    month: str | None,
    *,
    arrastre: bool = False,
    tipo: str | None = None,
) -> dict:
    anio, mes, mes_label = parse_month(month)
    mes_inicio = inicio_de_mes(anio, mes)

    cuotas_impagas = [
        cuota
        for cuota in list(Cuota.select().order_by(Cuota.fecha_vence))
        if cuota.estado != "pagado"
    ]
    cuotas = _filtrar_cuotas_cobros(cuotas_impagas, anio, mes, arrastre=arrastre)
    clientes = {cliente.id: cliente for cliente in list(Cliente.select())}

    filas = [
        build_cobros_item(cuota, mes_inicio, clientes)
        for cuota in cuotas
        if _matches_tipo(cuota, tipo)
    ]

    if arrastre:
        return _respuesta_cobros_arrastre(mes_label, filas)

    total = sum(fila["monto_usd"] for fila in filas)

    return {
        "mes": mes_label,
        "total_pendiente_usd": round(total, 2),
        "cantidad": len(filas),
        "cuotas": filas,
    }


def obtener_proyecciones(month: str | None) -> dict:
    return _obtener_proyecciones_db(month)


@db_session
def _obtener_proyecciones_db(month: str | None) -> dict:
    anio, mes, mes_label = parse_month(month)
    fin = fin_de_mes(anio, mes)

    cuotas = [
        cuota
        for cuota in list(Cuota.select().order_by(Cuota.fecha_vence))
        if cuota.estado != "pagado" and cuota.fecha_vence <= fin
    ]
    clientes = {cliente.id: cliente for cliente in list(Cliente.select())}

    recompras: list[dict] = []
    upsells: list[dict] = []
    for cuota in cuotas:
        nota_tipo = cuota_tipo(cuota)
        if nota_tipo == "cuota_recompra":
            recompras.append(build_proyeccion_item(cuota, clientes))
        elif nota_tipo == "cuota_upsell":
            upsells.append(build_proyeccion_item(cuota, clientes))

    total = round(
        sum(item["monto_usd"] for item in recompras) + sum(item["monto_usd"] for item in upsells),
        2,
    )

    return {
        "mes": mes_label,
        "total_proyectado_usd": total,
        "recompras": _grupo_proyeccion(recompras),
        "upsells": _grupo_proyeccion(upsells),
    }
