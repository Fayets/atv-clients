from datetime import date, datetime
from decimal import Decimal

from pony.orm import Optional, PrimaryKey, Required, Set

from src.db import db


class Cliente(db.Entity):
    _table_ = ("clients", "clientes")

    id = PrimaryKey(int, auto=True)
    nombre = Required(str, 255)
    email = Required(str, 255)
    plan_actual = Required(str, 50)
    session_id = Optional(int)
    fecha_inicio = Optional(date)
    duracion_dias = Optional(int)
    fecha_vencimiento = Optional(date)
    estado_cliente = Required(str, 50, default="vigente")
    oportunidad = Optional(str, 50, nullable=True)
    prioridad_cobro = Optional(str, 10, nullable=True)
    total_pagado_usd = Optional(Decimal, 10, 2, default=0)
    total_adeudado_usd = Optional(Decimal, 10, 2, default=0)
    miro_url = Optional(str, nullable=True, sql_type="TEXT")
    fathoms_url = Optional(str, nullable=True, sql_type="TEXT")
    arreglo_closer = Optional(str, nullable=True, sql_type="TEXT")
    observaciones = Optional(str, nullable=True, sql_type="TEXT")
    fecha_alta = Optional(datetime, default=lambda: datetime.utcnow())
    fecha_baja = Optional(datetime)
    updated_at = Optional(datetime, default=lambda: datetime.utcnow())
    cuotas = Set("Cuota")
    registros_observacion = Set("Observacion")
    miro_boards = Set("MiroBoard")
    fathom_boards = Set("FathomBoard")
    discord_transcripts = Set("DiscordTranscript")
    documento_links = Set("DocumentoLink")
    proximos_pasos = Set("ProximosPasos")


class MiroBoard(db.Entity):
    _table_ = ("clients", "miro_boards")

    id = PrimaryKey(int, auto=True)
    cliente = Required("Cliente", column="cliente_id")
    titulo = Required(str, 255)
    url = Required(str, sql_type="TEXT")
    created_at = Optional(datetime, default=lambda: datetime.utcnow())


class FathomBoard(db.Entity):
    _table_ = ("clients", "fathom_boards")

    id = PrimaryKey(int, auto=True)
    cliente = Required("Cliente", column="cliente_id")
    titulo = Required(str, 255)
    url = Required(str, sql_type="TEXT")
    created_at = Optional(datetime, default=lambda: datetime.utcnow())


class DiscordTranscript(db.Entity):
    _table_ = ("clients", "discord_transcripts")

    id = PrimaryKey(int, auto=True)
    cliente = Optional("Cliente", column="cliente_id")
    canal = Required(str, 100)
    categoria = Required(str, 50)
    fecha = Required(date)
    filepath = Required(str, sql_type="TEXT")
    mensajes = Optional(int, default=0)
    ultimo_mensaje_id = Optional(str, 50)
    creado_en = Optional(datetime, default=lambda: datetime.utcnow())


class DocumentoLink(db.Entity):
    _table_ = ("clients", "documento_links")

    id = PrimaryKey(int, auto=True)
    cliente = Required("Cliente", column="cliente_id")
    titulo = Required(str, 255)
    url = Required(str, sql_type="TEXT")
    created_at = Optional(datetime, default=lambda: datetime.utcnow())


class Observacion(db.Entity):
    _table_ = ("clients", "observaciones")

    id = PrimaryKey(int, auto=True)
    cliente = Required("Cliente", column="cliente_id")
    autor = Required(str, 255)
    texto = Required(str, sql_type="TEXT")
    created_at = Optional(datetime, default=lambda: datetime.utcnow())


class ProximosPasos(db.Entity):
    _table_ = ("clients", "proximos_pasos")

    id = PrimaryKey(int, auto=True)
    cliente = Required("Cliente", column="cliente_id")
    fecha_llamada = Required(date)
    mentor = Required(str, 100)
    contenido = Required(str, sql_type="TEXT")
    link = Optional(str, nullable=True, sql_type="TEXT")
    created_at = Optional(datetime, default=lambda: datetime.utcnow())


class Cuota(db.Entity):
    _table_ = ("clients", "cuotas")

    id = PrimaryKey(int, auto=True)
    cliente = Required("Cliente", column="cliente_id")
    monto_usd = Required(Decimal, 10, 2)
    fecha_vence = Required(date)
    fecha_pago = Optional(date)
    estado = Required(str, 20, default="pendiente")
    notas = Optional(str, sql_type="TEXT")
    created_at = Optional(datetime, default=lambda: datetime.utcnow())


class AnalisisCash(db.Entity):
    _table_ = ("clients", "analisis_cash")

    id = PrimaryKey(int, auto=True)
    total_usd = Required(Decimal, 14, 2, default=0)
    periodo = Required(str, 120, default="Últimos 3 meses")
    titulo = Required(str, 255, default="Cash collected")
    subtitulo = Required(str, 255, default="Lo que generaron nuestros clientes")
    historia = Optional(str, sql_type="TEXT")
    fuentes = Optional(str, sql_type="TEXT")
    updated_at = Optional(datetime, default=lambda: datetime.utcnow())
    updated_by = Optional(str, 255)
