from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal

import pytz
from fastapi import HTTPException
from pony.orm import db_session

from src.cuota_notas import normalizar_nota_cuota
from src.models import Cliente, Cuota
from src.services.clientes_services import (
    _cuota_pendiente_del_mes,
    _es_caja_2,
    calcular_estado_efectivo,
)

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
    del arrastre
    return [cuota for cuota in cuotas if _cuota_pendiente_del_mes(cuota, date(anio, mes, 1))]


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
    cuotas_filas = [fila for fila in filas if not _es_caja_2(fila["tipo"])]
    proyeccion_filas = [fila for fila in filas if _es_caja_2(fila["tipo"])]
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
        and calcular_estado_efectivo(cuota.cliente) != "inactivo"
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


def _plan_label(plan_actual: str | None) -> str:
    plan = (plan_actual or "").strip().lower()
    if "boost" in plan:
        return "Boost"
    if "advantage" in plan:
        return "Advantage"
    if "mentor" in plan or "avanz" in plan or "princip" in plan:
        return "Mentoría"
    return (plan_actual or "—").strip() or "—"


def _estado_ops(estado: str, fecha_vence: date, hoy: date) -> str:
    """Normaliza a pagada | pendiente | vencida (contrato atv-ops)."""
    if estado == "pagado":
        return "pagada"
    if estado == "vencido" or fecha_vence < hoy:
        return "vencida"
    return "pendiente"


@db_session
def obtener_cobranza_mes(month: str | None = None) -> dict:
    """
    Cuotas del mes para atv-ops: vencen en el mes o se pagaron en el mes.
    """
    anio, mes, mes_label = parse_month(month)
    hoy = today_ar()
    clientes = {c.id: c for c in Cliente.select()}
    filas: list[dict] = []

    for cuota in Cuota.select().order_by(Cuota.fecha_vence):
        fv = cuota.fecha_vence
        fp = cuota.fecha_pago
        en_mes_vence = fv.year == anio and fv.month == mes
        en_mes_pago = fp is not None and fp.year == anio and fp.month == mes
        if not (en_mes_vence or en_mes_pago):
            continue
        cliente = clientes.get(cuota.cliente.id)
        if not cliente:
            continue
        filas.append({
            "id": str(cuota.id),
            "cliente_id": cliente.id,
            "cliente": cliente.nombre,
            "plan": _plan_label(cliente.plan_actual),
            "monto_usd": monto_usd_redondeado(cuota.monto_usd),
            "vence_at": fv.isoformat(),
            "pagada_at": fp.isoformat() if fp else None,
            "estado": _estado_ops(cuota.estado, fv, hoy),
            "tipo": cuota_tipo(cuota),
        })

    filas.sort(key=lambda r: (r["vence_at"], r["cliente"]))
    return {
        "mes": mes_label,
        "hoy": hoy.isoformat(),
        "fuente": "atv_clients",
        "cuotas": filas,
    }


@db_session
def _obtener_proyecciones_db(month: str | None) -> dict:
    anio, mes, mes_label = parse_month(month)
    ref = date(anio, mes, 1)

    cuotas = [
        cuota
        for cuota in list(Cuota.select().order_by(Cuota.fecha_vence))
        if _cuota_pendiente_del_mes(cuota, ref)
        and calcular_estado_efectivo(cuota.cliente) != "inactivo"
    ]
    clientes = {cliente.id: cliente for cliente in list(Cliente.select())}

    recompras: list[dict] = []
    upsells: list[dict] = []
    posibilidades: list[dict] = []
    for cuota in cuotas:
        nota_tipo = cuota_tipo(cuota)
        if nota_tipo == "cuota_recompra":
            recompras.append(build_proyeccion_item(cuota, clientes))
        elif nota_tipo == "cuota_upsell":
            upsells.append(build_proyeccion_item(cuota, clientes))
        elif nota_tipo == "posibilidad_upsell":
            posibilidades.append(build_proyeccion_item(cuota, clientes))

    total = round(
        sum(item["monto_usd"] for item in recompras) + sum(item["monto_usd"] for item in upsells),
        2,
    )
    upsells_grupo = _grupo_proyeccion(upsells)
    # Visibles al fondo; no suman al total proyectado.
    if posibilidades:
        upsells_grupo["cuotas"].extend(posibilidades)
        upsells_grupo["cantidad"] = len(upsells) + len(posibilidades)

    return {
        "mes": mes_label,
        "total_proyectado_usd": total,
        "recompras": _grupo_proyeccion(recompras),
        "upsells": upsells_grupo,
    }
