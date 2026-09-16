"""Pagos parciales, imputación FIFO y acumulación de saldo al vencer.

El monto_usd de cada cuota es el plan original y no se muta.
arrastre_usd / transferido_usd y la tabla de pagos son el ledger encima del plan.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from src.cuota_notas import es_nota_sin_vencimiento, normalizar_nota_cuota
from src.models import CuotaEvento, Pago, PagoImputacion

ZERO = Decimal("0.00")
CENT = Decimal("0.01")

ESTADOS_CON_SALDO = frozenset({"pendiente", "parcialmente_pagada", "vencido"})
ESTADOS_CUOTA_PAGOS = frozenset({"pendiente", "parcialmente_pagada", "pagado", "vencido"})


def _dec(value: Decimal | int | float | None) -> Decimal:
    if value is None:
        return ZERO
    return Decimal(value).quantize(CENT)


def monto_plan(cuota: Cuota) -> Decimal:
    """Compromiso original (inmutable)."""
    return _dec(cuota.monto_usd)


def arrastre_entrante(cuota: Cuota) -> Decimal:
    return _dec(getattr(cuota, "arrastre_usd", None))


def transferido_saliente(cuota: Cuota) -> Decimal:
    return _dec(getattr(cuota, "transferido_usd", None))


def monto_exigido(cuota: Cuota) -> Decimal:
    """Lo que la cuota debe cobrar: plan + arrastre - lo ya transferido a la siguiente."""
    return monto_plan(cuota) + arrastre_entrante(cuota) - transferido_saliente(cuota)


def monto_imputado(cuota: Cuota) -> Decimal:
    return sum((_dec(i.monto_usd) for i in cuota.imputaciones), ZERO).quantize(CENT)


def saldo_pendiente(cuota: Cuota) -> Decimal:
    saldo = monto_exigido(cuota) - monto_imputado(cuota)
    return saldo if saldo > ZERO else ZERO


def cuotas_orden_fifo(cuotas: list[Cuota]) -> list[Cuota]:
    return sorted(
        cuotas,
        key=lambda c: (
            c.fecha_vence or date.max,
            c.id or 0,
        ),
    )


def cuotas_con_saldo(cuotas: list[Cuota]) -> list[Cuota]:
    return [c for c in cuotas_orden_fifo(cuotas) if saldo_pendiente(c) > ZERO]


def _recalcular_estado_cuota(cuota: Cuota, hoy: date) -> None:
    if es_nota_sin_vencimiento(cuota.notas):
        pagado = monto_imputado(cuota)
        exigido = monto_exigido(cuota)
        if exigido <= ZERO or pagado >= exigido:
            cuota.estado = "pagado"
            if pagado > ZERO and not cuota.fecha_pago:
                cuota.fecha_pago = hoy
        elif pagado > ZERO:
            cuota.estado = "parcialmente_pagada"
            cuota.fecha_pago = None
        else:
            cuota.estado = "pendiente"
            cuota.fecha_pago = None
        return

    pagado = monto_imputado(cuota)
    exigido = monto_exigido(cuota)
    fv = cuota.fecha_vence
    fully = exigido <= ZERO or pagado >= exigido

    if fully:
        cuota.estado = "pagado"
        if pagado > ZERO:
            # Última imputación define fecha de cierre si no hay.
            fechas = [i.pago.fecha for i in cuota.imputaciones if i.pago and i.pago.fecha]
            cuota.fecha_pago = max(fechas) if fechas else (cuota.fecha_pago or hoy)
        return

    cuota.fecha_pago = None
    if fv and fv < hoy:
        cuota.estado = "vencido"
    elif pagado > ZERO:
        cuota.estado = "parcialmente_pagada"
    else:
        cuota.estado = "pendiente"


def aplicar_acumulaciones(cliente, hoy: date) -> list[dict]:
    """DEPRECATED: la acumulación automática está desactivada.

    El saldo vencido queda en la cuota; el usuario lo mueve a mano.
    Se mantiene la firma por compatibilidad con imports antiguos.
    """
    del cliente, hoy
    return []


def cuotas_vencidas_con_saldo(cuotas: list, hoy: date | None = None) -> list:
    """Cuotas vencidas que todavía tienen saldo (candidatas a mover manualmente)."""
    ref = hoy or date.today()
    out = []
    for cuota in cuotas_orden_fifo(list(cuotas)):
        if es_nota_sin_vencimiento(cuota.notas):
            continue
        fv = cuota.fecha_vence
        if not fv or fv >= ref:
            continue
        if saldo_pendiente(cuota) > ZERO:
            out.append(cuota)
    return out


def mover_saldo_a_cuota(cliente, origen: Cuota, destino: Cuota, hoy: date | None = None) -> dict:
    """Mueve el saldo pendiente de una cuota a otra (arrastre manual)."""
    ref = hoy or date.today()
    if origen.id == destino.id:
        raise ValueError("Origen y destino deben ser cuotas distintas.")
    if origen.cliente.id != cliente.id or destino.cliente.id != cliente.id:
        raise ValueError("Las cuotas deben pertenecer al mismo cliente.")

    saldo = saldo_pendiente(origen)
    if saldo <= ZERO:
        raise ValueError("La cuota origen no tiene saldo para mover.")

    origen.transferido_usd = transferido_saliente(origen) + saldo
    destino.arrastre_usd = arrastre_entrante(destino) + saldo
    ev = CuotaEvento(
        cliente=cliente,
        cuota=origen,
        cuota_destino=destino,
        tipo="acumulacion_manual",
        monto_usd=saldo,
        detalle=(
            f"Saldo {saldo} de cuota #{origen.id} movido manualmente a cuota #{destino.id}"
        ),
        fecha=ref,
    )
    _recalcular_estado_cuota(origen, ref)
    _recalcular_estado_cuota(destino, ref)
    return {
        "id": ev.id,
        "tipo": ev.tipo,
        "monto_usd": saldo,
        "cuota_id": origen.id,
        "cuota_destino_id": destino.id,
        "fecha": ref,
    }


def revertir_transferencias_salientes(cuota, hoy: date | None = None) -> Decimal:
    """Devuelve el saldo transferido a la cuota origen (deshace arrastres salientes)."""
    ref = hoy or date.today()
    transferido = transferido_saliente(cuota)
    if transferido <= ZERO:
        return ZERO

    resto = transferido
    eventos = sorted(
        [
            e
            for e in list(getattr(cuota, "eventos_origen", []) or [])
            if getattr(e, "tipo", None) in ("acumulacion_manual", "acumulacion_vencimiento")
            and e.cuota_destino is not None
        ],
        key=lambda e: (e.fecha or date.min, e.id or 0),
        reverse=True,
    )
    for ev in eventos:
        if resto <= ZERO:
            break
        monto = min(_dec(ev.monto_usd), resto)
        destino = ev.cuota_destino
        if destino is not None:
            destino.arrastre_usd = max(ZERO, arrastre_entrante(destino) - monto)
            _recalcular_estado_cuota(destino, ref)
        resto -= monto
        # El evento deja de contar: el movimiento fue deshecho.
        ev.delete()

    if resto > ZERO:
        cliente = cuota.cliente
        for destino in cuotas_orden_fifo(list(cliente.cuotas)):
            if destino.id == cuota.id:
                continue
            arr = arrastre_entrante(destino)
            if arr <= ZERO:
                continue
            take = min(arr, resto)
            destino.arrastre_usd = arr - take
            _recalcular_estado_cuota(destino, ref)
            resto -= take
            if resto <= ZERO:
                break

    cuota.transferido_usd = ZERO
    _recalcular_estado_cuota(cuota, ref)
    return transferido


def limpiar_arrastres_huerfanos(cliente) -> None:
    """Anula arrastres/transferidos que no vienen de un movimiento manual vigente."""
    manual_por_origen: dict[int, Decimal] = {}
    manual_por_destino: dict[int, Decimal] = {}
    for ev in list(getattr(cliente, "cuota_eventos", []) or []):
        if getattr(ev, "tipo", None) != "acumulacion_manual":
            continue
        origen = ev.cuota
        destino = ev.cuota_destino
        monto = _dec(ev.monto_usd)
        if origen is not None:
            manual_por_origen[origen.id] = manual_por_origen.get(origen.id, ZERO) + monto
        if destino is not None:
            manual_por_destino[destino.id] = manual_por_destino.get(destino.id, ZERO) + monto

    for cuota in list(cliente.cuotas):
        cuota.transferido_usd = manual_por_origen.get(cuota.id, ZERO)
        cuota.arrastre_usd = manual_por_destino.get(cuota.id, ZERO)


def recalcular_cuotas_cliente(cliente, hoy: date | None = None) -> None:
    """Recalcula estados. No mueve saldos vencidos automáticamente."""
    ref = hoy or date.today()
    limpiar_arrastres_huerfanos(cliente)
    for cuota in cliente.cuotas:
        _recalcular_estado_cuota(cuota, ref)


def registrar_pago(
    cliente,
    *,
    monto: Decimal,
    fecha: date,
    origen: str = "manual",
    notas: str | None = None,
    hoy: date | None = None,
) -> tuple[Pago, list[dict]]:
    """Imputa el pago a las cuotas más viejas con saldo (FIFO)."""
    monto = _dec(monto)
    if monto <= ZERO:
        raise ValueError("El monto del pago debe ser mayor a cero.")

    ref = hoy or fecha
    recalcular_cuotas_cliente(cliente, ref)

    resto = monto
    imputaciones_data: list[dict] = []
    pago = Pago(
        cliente=cliente,
        monto_usd=monto,
        fecha=fecha,
        origen=origen,
        notas=notas,
    )

    for cuota in cuotas_con_saldo(list(cliente.cuotas)):
        if resto <= ZERO:
            break
        saldo = saldo_pendiente(cuota)
        aplicar = min(saldo, resto)
        PagoImputacion(pago=pago, cuota=cuota, monto_usd=aplicar)
        imputaciones_data.append({
            "cuota_id": cuota.id,
            "monto_usd": aplicar,
            "fecha_vence": cuota.fecha_vence,
        })
        resto -= aplicar

    if resto > ZERO:
        # Sobrepago: se deja en el pago sin imputar (queda registrado el total).
        # No inventamos cuota. El resto no reduce deuda.
        pass

    recalcular_cuotas_cliente(cliente, ref)
    return pago, imputaciones_data


def pago_to_dict(pago: Pago) -> dict:
    imputaciones = sorted(pago.imputaciones, key=lambda i: i.id or 0)
    return {
        "id": pago.id,
        "cliente_id": pago.cliente.id,
        "monto_usd": _dec(pago.monto_usd),
        "fecha": pago.fecha,
        "origen": pago.origen,
        "notas": pago.notas,
        "created_at": pago.created_at,
        "imputaciones": [
            {
                "id": item.id,
                "cuota_id": item.cuota.id,
                "monto_usd": _dec(item.monto_usd),
                "fecha_vence": item.cuota.fecha_vence,
                "nota_label": None,
            }
            for item in imputaciones
        ],
    }


def evento_to_dict(ev: CuotaEvento) -> dict:
    return {
        "id": ev.id,
        "cliente_id": ev.cliente.id,
        "cuota_id": ev.cuota.id if ev.cuota else None,
        "cuota_destino_id": ev.cuota_destino.id if ev.cuota_destino else None,
        "tipo": ev.tipo,
        "monto_usd": _dec(ev.monto_usd),
        "detalle": ev.detalle,
        "fecha": ev.fecha,
        "created_at": ev.created_at,
    }


def cuota_saldos_dict(cuota: Cuota) -> dict:
    plan = monto_plan(cuota)
    arrastre = arrastre_entrante(cuota)
    transferido = transferido_saliente(cuota)
    imputado = monto_imputado(cuota)
    exigido = monto_exigido(cuota)
    saldo = saldo_pendiente(cuota)
    return {
        "monto_plan_usd": plan,
        "arrastre_usd": arrastre,
        "transferido_usd": transferido,
        "monto_exigido_usd": exigido,
        "monto_pagado_usd": imputado,
        "saldo_pendiente_usd": saldo,
    }


def migrar_cuota_pagada_legacy(cuota: Cuota) -> Pago | None:
    """Crea un pago único por cuota ya marcada pagada sin ledger."""
    if cuota.estado != "pagado":
        return None
    if list(cuota.imputaciones):
        return None
    monto = monto_plan(cuota)
    if monto <= ZERO:
        return None
    fecha = cuota.fecha_pago or cuota.fecha_vence or date.today()
    pago = Pago(
        cliente=cuota.cliente,
        monto_usd=monto,
        fecha=fecha,
        origen="migracion",
        notas="migracion desde cuota pagada legacy",
    )
    PagoImputacion(pago=pago, cuota=cuota, monto_usd=monto)
    return pago


def historial_cliente(cliente) -> dict:
    pagos = sorted(
        list(cliente.pagos),
        key=lambda p: (p.fecha or date.min, p.id or 0),
        reverse=True,
    )
    eventos = sorted(
        list(cliente.cuota_eventos),
        key=lambda e: (e.fecha or date.min, e.id or 0),
        reverse=True,
    )
    cuotas = cuotas_orden_fifo(list(cliente.cuotas))
    return {
        "plan": [
            {
                "cuota_id": c.id,
                "monto_plan_usd": monto_plan(c),
                "fecha_vence": c.fecha_vence,
                "tipo": normalizar_nota_cuota(c.notas) or "cuota_venta",
                "estado": c.estado,
                **cuota_saldos_dict(c),
            }
            for c in cuotas
        ],
        "pagos": [pago_to_dict(p) for p in pagos],
        "eventos": [evento_to_dict(e) for e in eventos],
    }
