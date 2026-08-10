from __future__ import annotations

from fastapi import HTTPException
from pony.orm import db_session

from src.agent_caja import monto_usd_redondeado, today_ar
from src.cuota_notas import normalizar_nota_cuota
from src.format_fechas import format_fecha_ar
from src.models import Cliente, Cuota
from src.services.clientes_services import _recalcular_totales_cliente


def _tipo_from_notas(notas: str | None) -> str:
    if not notas or not notas.strip():
        return "cuota"
    first_line = notas.strip().split("\n")[0].strip()
    return normalizar_nota_cuota(first_line) or "cuota"


def _append_nota_agente(cuota: Cuota, accion: str) -> None:
    fecha = format_fecha_ar(today_ar())
    mensaje = f"{accion} el {fecha}"
    raw = (cuota.notas or "").strip()
    if raw:
        cuota.notas = f"{raw}\n{mensaje}"
        return
    tipo = "cuota"
    cuota.notas = f"{tipo}\n{mensaje}"


def _cuota_agente_resumen(
    cuota: Cuota,
    *,
    cliente_nombre: str,
    mensaje: str | None = None,
) -> dict:
    payload = {
        "cuota_id": cuota.id,
        "cliente_nombre": cliente_nombre,
        "monto_usd": monto_usd_redondeado(cuota.monto_usd),
        "estado": cuota.estado,
        "fecha_pago": cuota.fecha_pago,
    }
    if mensaje is not None:
        payload["mensaje"] = mensaje
    return payload


def _cuota_buscar_item(cuota: Cuota, cliente: Cliente) -> dict:
    return {
        "cuota_id": cuota.id,
        "cliente_nombre": cliente.nombre,
        "monto_usd": monto_usd_redondeado(cuota.monto_usd),
        "fecha_vence": cuota.fecha_vence,
        "estado": cuota.estado,
        "tipo": _tipo_from_notas(cuota.notas),
    }


def buscar_cuotas_por_cliente(cliente: str | None) -> dict:
    return _buscar_cuotas_por_cliente_db(cliente)


@db_session
def _buscar_cuotas_por_cliente_db(cliente: str | None) -> dict:
    if not cliente or not cliente.strip():
        raise HTTPException(status_code=400, detail="Indicá cliente para buscar cuotas.")

    needle = cliente.strip().lower()
    clientes_por_id = {
        item.id: item
        for item in list(Cliente.select())
        if needle in item.nombre.lower()
    }

    cuotas: list[dict] = []
    for cuota in list(Cuota.select().order_by(Cuota.fecha_vence)):
        cliente_row = clientes_por_id.get(cuota.cliente.id)
        if not cliente_row:
            continue
        cuotas.append(_cuota_buscar_item(cuota, cliente_row))

    return {"cuotas": cuotas}


def marcar_cuota_pagada_agente(cuota_id: int) -> dict:
    return _marcar_cuota_pagada_agente_db(cuota_id)


@db_session
def _marcar_cuota_pagada_agente_db(cuota_id: int) -> dict:
    cuota = Cuota.get(id=cuota_id)
    if not cuota:
        raise HTTPException(status_code=404, detail="Cuota no encontrada.")

    cliente = cuota.cliente
    cliente_nombre = cliente.nombre
    if cuota.estado == "pagado":
        return _cuota_agente_resumen(cuota, cliente_nombre=cliente_nombre, mensaje="ya estaba pagada")

    hoy = today_ar()
    cuota.estado = "pagado"
    cuota.fecha_pago = hoy
    _append_nota_agente(cuota, "marcada pagada vía agente")
    _recalcular_totales_cliente(cliente)
    return _cuota_agente_resumen(cuota, cliente_nombre=cliente_nombre)


def revertir_pago_cuota_agente(cuota_id: int) -> dict:
    return _revertir_pago_cuota_agente_db(cuota_id)


@db_session
def _revertir_pago_cuota_agente_db(cuota_id: int) -> dict:
    cuota = Cuota.get(id=cuota_id)
    if not cuota:
        raise HTTPException(status_code=404, detail="Cuota no encontrada.")

    cliente = cuota.cliente
    cliente_nombre = cliente.nombre
    if cuota.estado != "pagado":
        return _cuota_agente_resumen(cuota, cliente_nombre=cliente_nombre, mensaje="ya estaba pendiente")

    cuota.estado = "pendiente"
    cuota.fecha_pago = None
    _append_nota_agente(cuota, "revertida vía agente")
    _recalcular_totales_cliente(cliente)
    return _cuota_agente_resumen(cuota, cliente_nombre=cliente_nombre)
