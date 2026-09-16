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
    """Mueve el saldo pendiente de una cuota a otra (arrastre manual de deuda)."""
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


def absorber_cuota_en_destino(cliente, origen: Cuota, destino: Cuota, hoy: date | None = None) -> dict:
    """Absorbe una cuota suelta dentro de otra principal.

    - Pasa los pagos ya imputados al destino.
    - Si queda saldo sin pagar en origen y el destino todavía debe, lo convierte
      en pago del destino (casos tipo 'cuotas chicas' que en realidad eran subpagos).
    - Elimina la cuota origen si queda en cero.
    """
    ref = hoy or date.today()
    if origen.id == destino.id:
        raise ValueError("Origen y destino deben ser cuotas distintas.")
    if origen.cliente.id != cliente.id or destino.cliente.id != cliente.id:
        raise ValueError("Las cuotas deben pertenecer al mismo cliente.")

    recalcular_cuotas_cliente(cliente, ref)
    if saldo_pendiente(destino) <= ZERO and monto_imputado(origen) <= ZERO and saldo_pendiente(origen) <= ZERO:
        raise ValueError("No hay nada para absorber en la cuota destino.")

    movido_pagos = ZERO
    pagos_para_comps: list = []
    for imputacion in list(origen.imputaciones):
        room = saldo_pendiente(destino)
        if room <= ZERO:
            break
        monto_imp = _dec(imputacion.monto_usd)
        if monto_imp <= ZERO:
            continue
        aplicar = min(monto_imp, room)
        if aplicar >= monto_imp:
            if imputacion.pago is not None:
                pagos_para_comps.append(imputacion.pago)
            imputacion.cuota = destino
            movido_pagos += aplicar
        else:
            imputacion.monto_usd = monto_imp - aplicar
            PagoImputacion(pago=imputacion.pago, cuota=destino, monto_usd=aplicar)
            if imputacion.pago is not None:
                pagos_para_comps.append(imputacion.pago)
            movido_pagos += aplicar
        _recalcular_estado_cuota(destino, ref)

    # La parte del plan de origen que ya estaba cubierta por esos pagos deja de existir.
    if movido_pagos > ZERO:
        nuevo_plan = monto_plan(origen) - movido_pagos
        origen.monto_usd = nuevo_plan if nuevo_plan > ZERO else ZERO
        if list(origen.imputaciones):
            pass
        else:
            origen.fecha_pago = None
        _recalcular_estado_cuota(origen, ref)

    convertido = ZERO
    room = saldo_pendiente(destino)
    unpaid = saldo_pendiente(origen)
    pago_conversion = None
    if room > ZERO and unpaid > ZERO:
        take = min(room, unpaid)
        fecha_pago = origen.fecha_vence or origen.fecha_pago or ref
        pago_conversion = Pago(
            cliente=cliente,
            monto_usd=take,
            fecha=fecha_pago,
            origen="absorcion",
            notas=f"absorción cuota #{origen.id} → #{destino.id}",
        )
        PagoImputacion(pago=pago_conversion, cuota=destino, monto_usd=take)
        pagos_para_comps.append(pago_conversion)
        convertido = take
        nuevo_plan = monto_plan(origen) - take
        origen.monto_usd = nuevo_plan if nuevo_plan > ZERO else ZERO
        origen.fecha_pago = None
        _recalcular_estado_cuota(origen, ref)
        _recalcular_estado_cuota(destino, ref)

    total = movido_pagos + convertido
    if total <= ZERO:
        raise ValueError("No se pudo absorber: el destino no tiene saldo o el origen está vacío.")

    CuotaEvento(
        cliente=cliente,
        cuota=origen,
        cuota_destino=destino,
        tipo="absorcion_cuota",
        monto_usd=total,
        detalle=(
            f"Cuota #{origen.id} absorbida en #{destino.id}: "
            f"pagos {movido_pagos} + saldo convertido {convertido}"
        ),
        fecha=ref,
    )

    # Conservar comprobantes en el destino, vinculados al pago absorbido.
    comps = list(origen.comprobantes)
    for idx, comp in enumerate(comps):
        comp.cuota = destino
        if getattr(comp, "pago", None) is None and idx < len(pagos_para_comps):
            comp.pago = pagos_para_comps[idx]
        elif getattr(comp, "pago", None) is None and pagos_para_comps:
            comp.pago = pagos_para_comps[-1]

    origen_eliminada = False
    recalcular_cuotas_cliente(cliente, ref)
    if monto_plan(origen) <= ZERO and monto_imputado(origen) <= ZERO and saldo_pendiente(origen) <= ZERO:
        origen_id = origen.id
        origen.delete()
        origen_eliminada = True
    else:
        origen_id = origen.id

    return {
        "tipo": "absorcion_cuota",
        "monto_usd": total,
        "pagos_movidos_usd": movido_pagos,
        "saldo_convertido_usd": convertido,
        "cuota_id": origen_id,
        "cuota_destino_id": destino.id,
        "origen_eliminada": origen_eliminada,
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
    cuota_id: int | None = None,
) -> tuple[Pago, list[dict]]:
    """Imputa el pago. Si viene cuota_id, va a esa cuota; si no, FIFO."""
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

    orden: list = []
    if cuota_id is not None:
        destino = next((c for c in cliente.cuotas if c.id == cuota_id), None)
        if destino is None:
            raise ValueError("La cuota indicada no existe para este cliente.")
        if saldo_pendiente(destino) <= ZERO:
            raise ValueError("Esa cuota no tiene saldo pendiente para imputar.")
        orden = [destino]
        # El resto (si el pago supera el saldo) sigue en FIFO sobre las demás.
        orden.extend(c for c in cuotas_con_saldo(list(cliente.cuotas)) if c.id != destino.id)
    else:
        orden = cuotas_con_saldo(list(cliente.cuotas))

    for cuota in orden:
        if resto <= ZERO:
            break
        saldo = saldo_pendiente(cuota)
        if saldo <= ZERO:
            continue
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
        pass

    recalcular_cuotas_cliente(cliente, ref)
    return pago, imputaciones_data


def mover_imputacion_a_cuota(cliente, imputacion_id: int, cuota_destino_id: int, hoy: date | None = None) -> dict:
    """Reasigna un pago ya imputado a otra cuota del mismo cliente."""
    ref = hoy or date.today()
    imputacion = next(
        (i for p in cliente.pagos for i in p.imputaciones if i.id == imputacion_id),
        None,
    )
    if imputacion is None:
        raise ValueError("Imputación no encontrada.")
    destino = next((c for c in cliente.cuotas if c.id == cuota_destino_id), None)
    if destino is None:
        raise ValueError("Cuota destino no encontrada.")
    origen = imputacion.cuota
    if origen.id == destino.id:
        raise ValueError("Origen y destino deben ser distintos.")

    monto = _dec(imputacion.monto_usd)
    saldo_dest = saldo_pendiente(destino)
    if saldo_dest <= ZERO:
        raise ValueError("La cuota destino no tiene saldo pendiente.")
    if monto > saldo_dest:
        raise ValueError(
            f"El pago ({monto}) supera el saldo de la cuota destino ({saldo_dest})."
        )

    imputacion.cuota = destino
    pago = imputacion.pago
    if pago is not None:
        for comp in list(getattr(origen, "comprobantes", []) or []):
            if getattr(comp, "pago", None) is not None and comp.pago.id == pago.id:
                comp.cuota = destino
    recalcular_cuotas_cliente(cliente, ref)
    return {
        "imputacion_id": imputacion.id,
        "monto_usd": monto,
        "cuota_origen_id": origen.id,
        "cuota_destino_id": destino.id,
    }


def actualizar_imputacion(
    cliente,
    imputacion_id: int,
    *,
    monto_usd: Decimal | None = None,
    fecha: date | None = None,
    hoy: date | None = None,
) -> dict:
    ref = hoy or date.today()
    imputacion = next(
        (i for p in cliente.pagos for i in p.imputaciones if i.id == imputacion_id),
        None,
    )
    if imputacion is None:
        raise ValueError("Imputación no encontrada.")
    pago = imputacion.pago
    cuota = imputacion.cuota
    if monto_usd is not None:
        nuevo = _dec(monto_usd)
        if nuevo <= ZERO:
            raise ValueError("El monto debe ser mayor a cero.")
        # Permitir subir hasta cubrir el saldo pendiente + lo ya imputado en esta fila.
        room = saldo_pendiente(cuota) + _dec(imputacion.monto_usd)
        if nuevo > room:
            raise ValueError(f"El monto supera el saldo de la cuota ({room}).")
        imputacion.monto_usd = nuevo
        if pago is not None and len(list(pago.imputaciones)) == 1:
            pago.monto_usd = nuevo
    if fecha is not None and pago is not None:
        pago.fecha = fecha
    recalcular_cuotas_cliente(cliente, ref)
    return {
        "imputacion_id": imputacion.id,
        "pago_id": pago.id if pago else None,
        "cuota_id": cuota.id,
        "monto_usd": _dec(imputacion.monto_usd),
        "fecha": pago.fecha if pago else None,
    }


def eliminar_imputacion(cliente, imputacion_id: int, hoy: date | None = None) -> dict:
    ref = hoy or date.today()
    imputacion = next(
        (i for p in cliente.pagos for i in p.imputaciones if i.id == imputacion_id),
        None,
    )
    if imputacion is None:
        raise ValueError("Imputación no encontrada.")
    pago = imputacion.pago
    cuota_id = imputacion.cuota.id
    imputacion_id_out = imputacion.id
    imputacion.delete()
    if pago is not None and not list(pago.imputaciones):
        # Desvincular comprobantes del pago antes de borrar.
        for comp in list(getattr(pago, "comprobantes", []) or []):
            comp.pago = None
        pago.delete()
    recalcular_cuotas_cliente(cliente, ref)
    return {"imputacion_id": imputacion_id_out, "cuota_id": cuota_id}


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
