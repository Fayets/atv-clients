from __future__ import annotations

import json
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import psycopg2
from decouple import config
from fastapi import HTTPException, UploadFile
from pony.orm import db_session, flush

from src.form_labels import FORM_QUESTION_LABELS, LEGACY_FORM_LABELS
from src.models import Cliente, Cuota, DiscordTranscript, DocumentoLink, FathomBoard, MiroBoard, Observacion, ProximosPasos
from src.schemas import (
    ClienteCreate,
    ClientePatch,
    CuotaCreate,
    CuotaPatch,
    DocumentoLinkCreate,
    DocumentoLinkPatch,
    FathomBoardCreate,
    FathomBoardPatch,
    MiroBoardCreate,
    MiroBoardPatch,
    ObservacionCreate,
    ProximosPasosCreate,
    ProximosPasosPatch,
)

MANUAL_ESTADOS = frozenset({"pausa", "no_va_a_renovar", "estan_bien", "llamada_recompra"})
ESTADOS_VALIDOS = frozenset(
    {
        "vigente",
        "proximo_a_vencer",
        "vencido",
        "pausa",
        "no_va_a_renovar",
        "llamada_recompra",
        "estan_bien",
    }
)
OPORTUNIDADES_VALIDAS = frozenset({"upsell_boost", "upsell_advantage", "recompra", "consultar"})
PLANES_VALIDOS = frozenset({"mentoria", "boost", "advantage"})
DURACION_POR_PLAN = {"boost": 240, "mentoria": 120, "advantage": 120}
PRIORIDADES_VALIDAS = frozenset({"alta", "media", "baja"})
PRIORIDAD_ORDEN = {"alta": 0, "media": 1, "baja": 2, None: 3}
ESTADOS_CUOTA_VALIDOS = frozenset({"pendiente", "pagado", "vencido"})
UPLOAD_DIR = Path(config("UPLOAD_DIR", default="uploads"))
MAX_DISCORD_TXT_BYTES = 5 * 1024 * 1024


def _today() -> date:
    return date.today()


def calcular_estado_efectivo(cliente: Cliente) -> str:
    if cliente.estado_cliente in MANUAL_ESTADOS:
        return cliente.estado_cliente

    if not cliente.fecha_vencimiento:
        return cliente.estado_cliente or "vigente"

    hoy = _today()
    if cliente.fecha_vencimiento < hoy:
        return "vencido"
    if cliente.fecha_vencimiento <= hoy + timedelta(days=30):
        return "proximo_a_vencer"
    return "vigente"


def calcular_dias_restantes(cliente: Cliente) -> int | None:
    if not cliente.fecha_vencimiento:
        return None
    return (cliente.fecha_vencimiento - _today()).days


def _decimal(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal("0")


def _recalcular_totales_cliente(cliente: Cliente) -> None:
    pagado = Decimal("0")
    adeudado = Decimal("0")
    for cuota in cliente.cuotas:
        monto = _decimal(cuota.monto_usd)
        if cuota.estado == "pagado":
            pagado += monto
        elif cuota.estado in {"pendiente", "vencido"}:
            adeudado += monto
    cliente.total_pagado_usd = pagado
    cliente.total_adeudado_usd = adeudado
    cliente.updated_at = datetime.utcnow()


def _get_cuota_cliente(cliente_id: int, cuota_id: int) -> tuple[Cliente, Cuota] | tuple[None, None]:
    cliente = Cliente.get(id=cliente_id)
    if not cliente:
        return None, None
    cuota = Cuota.get(id=cuota_id, cliente=cliente)
    if not cuota:
        return None, None
    return cliente, cuota


def _normalize_board_titulo(titulo: str) -> str:
    return titulo.strip().upper()


def _normalize_miro_titulo(titulo: str) -> str:
    return _normalize_board_titulo(titulo)


def _miro_board_to_dict(board: MiroBoard) -> dict:
    return {
        "id": board.id,
        "cliente_id": board.cliente.id,
        "titulo": board.titulo,
        "url": board.url,
        "created_at": board.created_at,
    }


def _fathom_board_to_dict(board: FathomBoard) -> dict:
    return {
        "id": board.id,
        "cliente_id": board.cliente.id,
        "titulo": board.titulo,
        "url": board.url,
        "created_at": board.created_at,
    }


def _discord_transcript_to_dict(transcript: DiscordTranscript) -> dict:
    return {
        "id": transcript.id,
        "cliente_id": transcript.cliente.id if transcript.cliente else None,
        "canal": transcript.canal,
        "categoria": transcript.categoria,
        "fecha": transcript.fecha,
        "filepath": transcript.filepath,
        "mensajes": transcript.mensajes or 0,
        "creado_en": transcript.creado_en,
    }


def _discord_transcript_agent_list_dict(transcript: DiscordTranscript) -> dict:
    return {
        "id": transcript.id,
        "canal": transcript.canal,
        "categoria": transcript.categoria,
        "fecha": transcript.fecha,
        "mensajes": transcript.mensajes or 0,
    }


def _sanitize_cliente_for_agent(data: dict) -> dict:
    result = dict(data)
    result["discord_transcripts"] = [
        {k: v for k, v in transcript.items() if k != "filepath"}
        for transcript in data.get("discord_transcripts", [])
    ]
    return result


def _documento_link_to_dict(link: DocumentoLink) -> dict:
    return {
        "id": link.id,
        "cliente_id": link.cliente.id,
        "titulo": link.titulo,
        "url": link.url,
        "created_at": link.created_at,
    }


def _discord_client_dir(cliente_id: int) -> Path:
    return UPLOAD_DIR / "discord" / str(cliente_id)


def _observacion_to_dict(observacion: Observacion) -> dict:
    return {
        "id": observacion.id,
        "cliente_id": observacion.cliente.id,
        "autor": observacion.autor,
        "texto": observacion.texto,
        "created_at": observacion.created_at,
    }


def _proximos_pasos_to_dict(paso: ProximosPasos) -> dict:
    return {
        "id": paso.id,
        "cliente_id": paso.cliente.id,
        "fecha_llamada": paso.fecha_llamada,
        "mentor": paso.mentor,
        "contenido": paso.contenido,
        "link": paso.link,
        "created_at": paso.created_at,
    }


def _sort_proximos_pasos(pasos: list[ProximosPasos]) -> list[ProximosPasos]:
    return sorted(
        pasos,
        key=lambda p: (p.fecha_llamada, p.created_at or datetime.min),
        reverse=True,
    )


@dataclass
class _ClienteRelationsCache:
    miros: dict[int, list[MiroBoard]] = field(default_factory=lambda: defaultdict(list))
    fathoms: dict[int, list[FathomBoard]] = field(default_factory=lambda: defaultdict(list))
    proximos_pasos: dict[int, list[ProximosPasos]] = field(default_factory=lambda: defaultdict(list))
    cuotas: dict[int, list[Cuota]] = field(default_factory=lambda: defaultdict(list))
    observaciones: dict[int, list[Observacion]] = field(default_factory=lambda: defaultdict(list))
    discord_transcripts: dict[int, list[DiscordTranscript]] = field(default_factory=lambda: defaultdict(list))
    documento_links: dict[int, list[DocumentoLink]] = field(default_factory=lambda: defaultdict(list))


def _load_relations_cache(*, include_detail: bool = False) -> _ClienteRelationsCache:
    cache = _ClienteRelationsCache()
    for board in MiroBoard.select():
        cache.miros[board.cliente.id].append(board)
    for board in FathomBoard.select():
        cache.fathoms[board.cliente.id].append(board)
    for paso in ProximosPasos.select():
        cache.proximos_pasos[paso.cliente.id].append(paso)
    for cuota in Cuota.select():
        cache.cuotas[cuota.cliente.id].append(cuota)
    if include_detail:
        for observacion in Observacion.select():
            cache.observaciones[observacion.cliente.id].append(observacion)
        for transcript in DiscordTranscript.select():
            if transcript.cliente:
                cache.discord_transcripts[transcript.cliente.id].append(transcript)
        for link in DocumentoLink.select():
            cache.documento_links[link.cliente.id].append(link)
    return cache


def _sorted_miro_boards(cliente: Cliente, cache: _ClienteRelationsCache | None = None) -> list[MiroBoard]:
    boards = cache.miros.get(cliente.id, []) if cache else list(cliente.miro_boards)
    return sorted(boards, key=lambda m: m.created_at or datetime.min)


def _sorted_fathom_boards(cliente: Cliente, cache: _ClienteRelationsCache | None = None) -> list[FathomBoard]:
    boards = cache.fathoms.get(cliente.id, []) if cache else list(cliente.fathom_boards)
    return sorted(boards, key=lambda b: b.created_at or datetime.min)


def _fathom_fields(
    cliente: Cliente,
    boards: list[FathomBoard],
) -> tuple[str | None, date | None, str | None]:
    if not boards:
        legacy = cliente.fathoms_url
        return legacy, None, legacy
    sorted_asc = sorted(boards, key=lambda b: b.created_at or datetime.min)
    sorted_desc = sorted(boards, key=lambda b: b.created_at or datetime.min, reverse=True)
    latest = sorted_desc[0]
    last_call = latest.created_at.date() if latest.created_at else None
    return sorted_asc[0].url, last_call, latest.url


def _cuota_to_dict(cuota: Cuota) -> dict:
    return {
        "id": cuota.id,
        "cliente_id": cuota.cliente.id,
        "monto_usd": _decimal(cuota.monto_usd),
        "fecha_vence": cuota.fecha_vence,
        "fecha_pago": cuota.fecha_pago,
        "estado": cuota.estado,
        "notas": cuota.notas,
        "created_at": cuota.created_at,
    }


def _cliente_base_dict(
    cliente: Cliente,
    cache: _ClienteRelationsCache | None = None,
) -> dict:
    miros = _sorted_miro_boards(cliente, cache)
    fathom_boards = cache.fathoms.get(cliente.id, []) if cache else list(cliente.fathom_boards)
    pasos_raw = cache.proximos_pasos.get(cliente.id, []) if cache else list(cliente.proximos_pasos)
    pasos = _sort_proximos_pasos(pasos_raw)
    fathoms_url, fathom_last_call, fathom_last_call_url = _fathom_fields(cliente, fathom_boards)

    return {
        "id": cliente.id,
        "nombre": cliente.nombre,
        "email": cliente.email,
        "plan_actual": cliente.plan_actual,
        "fecha_vencimiento": cliente.fecha_vencimiento,
        "estado_cliente": cliente.estado_cliente,
        "estado_efectivo": calcular_estado_efectivo(cliente),
        "dias_restantes": calcular_dias_restantes(cliente),
        "oportunidad": cliente.oportunidad,
        "prioridad_cobro": cliente.prioridad_cobro,
        "total_pagado_usd": _decimal(cliente.total_pagado_usd),
        "total_adeudado_usd": _decimal(cliente.total_adeudado_usd),
        "miro_url": miros[0].url if miros else cliente.miro_url,
        "fathoms_url": fathoms_url,
        "fathom_last_call": fathom_last_call,
        "fathom_last_call_url": fathom_last_call_url,
        "miros": [_miro_board_to_dict(m) for m in miros],
        "ultimo_proximos_pasos": _proximos_pasos_to_dict(pasos[0]) if pasos else None,
    }


def _proxima_cuota_pendiente(
    cliente: Cliente,
    cache: _ClienteRelationsCache | None = None,
) -> dict | None:
    cuotas = cache.cuotas.get(cliente.id, []) if cache else list(cliente.cuotas)
    pendientes = sorted(
        [c for c in cuotas if c.estado == "pendiente"],
        key=lambda c: c.fecha_vence,
    )
    if not pendientes:
        return None
    cuota = pendientes[0]
    return {
        "id": cuota.id,
        "monto_usd": _decimal(cuota.monto_usd),
        "fecha_vence": cuota.fecha_vence,
        "estado": cuota.estado,
    }


def _format_respuesta(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, (list, dict)):
        return json.dumps(value, ensure_ascii=False)
    text = str(value).strip()
    return text if text else "—"


def _form_data_to_respuestas(form_data: dict) -> list[dict]:
    if not isinstance(form_data, dict):
        return []

    labels = {**LEGACY_FORM_LABELS, **FORM_QUESTION_LABELS}
    keys = sorted(form_data.keys(), key=lambda key: (not str(key).isdigit(), int(key) if str(key).isdigit() else str(key)))

    return [
        {
            "pregunta": labels.get(str(key), str(key)),
            "respuesta": _format_respuesta(form_data[key]),
        }
        for key in keys
    ]


def _fetch_onboarding_form(session_id: int) -> list[dict]:
    database_url = config("DATABASE_URL", default="")
    if not database_url or not session_id:
        return []

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT form_data
                FROM onboarding.forms
                WHERE session_id::text = %s
                ORDER BY submitted_at DESC NULLS LAST
                LIMIT 1
                """,
                (str(session_id),),
            )
            row = cur.fetchone()
            if not row or not row[0]:
                return []
            form_data = row[0]
            if isinstance(form_data, str):
                form_data = json.loads(form_data)
            return _form_data_to_respuestas(form_data)
    except Exception:
        return []
    finally:
        conn.close()


class ClientesServices:
    def crear_cliente(self, data: ClienteCreate) -> dict:
        if data.plan_actual not in PLANES_VALIDOS:
            raise HTTPException(status_code=400, detail="Plan inválido.")

        if data.estado_cliente not in ESTADOS_VALIDOS:
            raise HTTPException(status_code=400, detail="Estado de cliente inválido.")

        fecha_inicio = data.fecha_inicio or _today()
        duracion_dias = data.duracion_dias or DURACION_POR_PLAN[data.plan_actual]
        fecha_vencimiento = data.fecha_vencimiento or (fecha_inicio + timedelta(days=duracion_dias))

        with db_session:
            cliente_kwargs = {
                "nombre": data.nombre.strip(),
                "email": str(data.email).strip().lower(),
                "plan_actual": data.plan_actual,
                "fecha_inicio": fecha_inicio,
                "duracion_dias": duracion_dias,
                "fecha_vencimiento": fecha_vencimiento,
                "estado_cliente": data.estado_cliente,
                "total_pagado_usd": data.total_pagado_usd,
                "total_adeudado_usd": data.total_adeudado_usd,
            }
            if data.session_id is not None:
                cliente_kwargs["session_id"] = data.session_id
            if data.observaciones is not None:
                cliente_kwargs["observaciones"] = data.observaciones

            cliente = Cliente(**cliente_kwargs)
            return _cliente_base_dict(cliente)

    def listar_clientes(
        self,
        *,
        estado: str | None = None,
        plan: str | None = None,
        q: str | None = None,
        orden: str = "venc_asc",
    ) -> list[dict]:
        with db_session:
            clientes = []
            for cliente in Cliente.select():
                if plan and cliente.plan_actual != plan:
                    continue
                clientes.append(cliente)

            if q:
                needle = q.strip().lower()
                clientes = [
                    cliente
                    for cliente in clientes
                    if needle in cliente.nombre.lower() or needle in cliente.email.lower()
                ]

            cache = _load_relations_cache()
            items = [_cliente_base_dict(cliente, cache) for cliente in clientes]

        if estado:
            items = [item for item in items if item["estado_efectivo"] == estado]

        reverse = orden == "venc_desc"

        def sort_key(item: dict) -> tuple:
            fv = item["fecha_vencimiento"]
            return (fv is None, fv or date.min)

        items.sort(key=sort_key, reverse=reverse)
        return items

    def listar_cobranza(self) -> list[dict]:
        with db_session:
            clientes = []
            for cliente in Cliente.select():
                clientes.append(cliente)

            cache = _load_relations_cache()
            items: list[dict] = []
            for cliente in clientes:
                base = _cliente_base_dict(cliente, cache)
                adeudado = base["total_adeudado_usd"]
                estado_efectivo = base["estado_efectivo"]
                if adeudado > 0 or estado_efectivo in {"vencido", "proximo_a_vencer"}:
                    item = {**base, "proxima_cuota": _proxima_cuota_pendiente(cliente, cache)}
                    items.append(item)

        items.sort(
            key=lambda item: (
                PRIORIDAD_ORDEN.get(item["prioridad_cobro"], 3),
                item["dias_restantes"] if item["dias_restantes"] is not None else 999999,
            )
        )
        return items

    def obtener_cliente(self, cliente_id: int) -> dict | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            cache = _load_relations_cache(include_detail=True)
            cid = cliente.id
            cuotas = sorted(cache.cuotas.get(cid, []), key=lambda c: c.fecha_vence)
            observaciones = sorted(
                cache.observaciones.get(cid, []),
                key=lambda o: o.created_at or datetime.min,
                reverse=True,
            )
            miros = _sorted_miro_boards(cliente, cache)
            fathoms = _sorted_fathom_boards(cliente, cache)
            discord_transcripts = sorted(
                cache.discord_transcripts.get(cid, []),
                key=lambda t: t.creado_en or datetime.min,
                reverse=True,
            )
            documento_links = sorted(
                cache.documento_links.get(cid, []),
                key=lambda d: d.created_at or datetime.min,
            )
            proximos_pasos = _sort_proximos_pasos(cache.proximos_pasos.get(cid, []))
            data = {
                **_cliente_base_dict(cliente, cache),
                "session_id": cliente.session_id,
                "fecha_inicio": cliente.fecha_inicio,
                "duracion_dias": cliente.duracion_dias,
                "arreglo_closer": cliente.arreglo_closer,
                "miros": [_miro_board_to_dict(m) for m in miros],
                "fathoms": [_fathom_board_to_dict(f) for f in fathoms],
                "discord_transcripts": [_discord_transcript_to_dict(t) for t in discord_transcripts],
                "documento_links": [_documento_link_to_dict(d) for d in documento_links],
                "observaciones": [_observacion_to_dict(o) for o in observaciones],
                "proximos_pasos": [_proximos_pasos_to_dict(p) for p in proximos_pasos],
                "fecha_alta": cliente.fecha_alta,
                "fecha_baja": cliente.fecha_baja,
                "updated_at": cliente.updated_at,
                "cuotas": [_cuota_to_dict(c) for c in cuotas],
            }

        data["formulario_onboarding"] = (
            _fetch_onboarding_form(data["session_id"]) if data.get("session_id") else []
        )
        return data

    def actualizar_cliente(self, cliente_id: int, patch: ClientePatch) -> dict | None:
        payload = patch.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar.")

        if "estado_cliente" in payload and payload["estado_cliente"] not in ESTADOS_VALIDOS:
            raise HTTPException(status_code=400, detail="Estado de cliente inválido.")

        if "plan_actual" in payload and payload["plan_actual"] not in PLANES_VALIDOS:
            raise HTTPException(status_code=400, detail="Plan inválido.")

        if "oportunidad" in payload and payload["oportunidad"] not in OPORTUNIDADES_VALIDAS:
            raise HTTPException(status_code=400, detail="Oportunidad inválida.")

        if "prioridad_cobro" in payload and payload["prioridad_cobro"] not in PRIORIDADES_VALIDAS:
            raise HTTPException(status_code=400, detail="Prioridad de cobro inválida.")

        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            for field, value in payload.items():
                setattr(cliente, field, value)
            cliente.updated_at = datetime.utcnow()

            return _cliente_base_dict(cliente)

    def crear_cuota(self, cliente_id: int, data: CuotaCreate) -> dict | None:
        if data.monto_usd <= 0:
            raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero.")

        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            cuota_kwargs = {
                "cliente": cliente,
                "monto_usd": data.monto_usd,
                "fecha_vence": data.fecha_vence,
                "estado": "pendiente",
            }
            if data.notas is not None:
                cuota_kwargs["notas"] = data.notas

            cuota = Cuota(**cuota_kwargs)
            _recalcular_totales_cliente(cliente)
            return _cuota_to_dict(cuota)

    def actualizar_cuota(self, cliente_id: int, cuota_id: int, patch: CuotaPatch) -> dict | None:
        payload = patch.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar.")

        if "estado" in payload and payload["estado"] not in ESTADOS_CUOTA_VALIDOS:
            raise HTTPException(status_code=400, detail="Estado de cuota inválido.")

        if "monto_usd" in payload and payload["monto_usd"] <= 0:
            raise HTTPException(status_code=400, detail="El monto debe ser mayor a cero.")

        with db_session:
            cliente, cuota = _get_cuota_cliente(cliente_id, cuota_id)
            if not cliente or not cuota:
                return None

            if payload.get("estado") == "pagado" and "fecha_pago" not in payload:
                payload["fecha_pago"] = _today()

            for field, value in payload.items():
                setattr(cuota, field, value)

            _recalcular_totales_cliente(cliente)
            return _cuota_to_dict(cuota)

    def eliminar_cuota(self, cliente_id: int, cuota_id: int) -> bool:
        with db_session:
            cliente, cuota = _get_cuota_cliente(cliente_id, cuota_id)
            if not cliente or not cuota:
                return False

            cuota.delete()
            _recalcular_totales_cliente(cliente)
            return True

    def marcar_cuota_pagada(self, cliente_id: int, cuota_id: int) -> dict | None:
        with db_session:
            cliente, cuota = _get_cuota_cliente(cliente_id, cuota_id)
            if not cliente or not cuota:
                return None

            cuota.estado = "pagado"
            cuota.fecha_pago = _today()
            _recalcular_totales_cliente(cliente)
            return _cuota_to_dict(cuota)

    def crear_observacion(self, cliente_id: int, data: ObservacionCreate) -> dict | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            observacion = Observacion(
                cliente=cliente,
                autor=data.autor.strip(),
                texto=data.texto.strip(),
            )
            cliente.updated_at = datetime.utcnow()
            flush()
            return _observacion_to_dict(observacion)

    def eliminar_observacion(self, cliente_id: int, observacion_id: int) -> bool:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return False

            observacion = Observacion.get(id=observacion_id, cliente=cliente)
            if not observacion:
                return False

            observacion.delete()
            cliente.updated_at = datetime.utcnow()
            return True

    def listar_proximos_pasos(self, cliente_id: int) -> list[dict] | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None
            pasos = _sort_proximos_pasos(list(cliente.proximos_pasos))
            return [_proximos_pasos_to_dict(p) for p in pasos]

    def crear_proximos_pasos(self, cliente_id: int, data: ProximosPasosCreate) -> dict | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            contenido = data.contenido.strip() or "—"

            paso = ProximosPasos(
                cliente=cliente,
                fecha_llamada=data.fecha_llamada,
                mentor=data.mentor.strip(),
                contenido=contenido,
                link=data.link,
            )
            cliente.updated_at = datetime.utcnow()
            flush()
            return _proximos_pasos_to_dict(paso)

    def actualizar_proximos_pasos(self, cliente_id: int, paso_id: int, data: ProximosPasosPatch) -> dict | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            paso = ProximosPasos.get(id=paso_id, cliente=cliente)
            if not paso:
                return None

            contenido = data.contenido.strip() or "—"

            paso.fecha_llamada = data.fecha_llamada
            paso.mentor = data.mentor.strip()
            paso.contenido = contenido
            paso.link = data.link
            cliente.updated_at = datetime.utcnow()
            flush()
            return _proximos_pasos_to_dict(paso)

    def eliminar_proximos_pasos(self, cliente_id: int, paso_id: int) -> bool:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return False

            paso = ProximosPasos.get(id=paso_id, cliente=cliente)
            if not paso:
                return False

            paso.delete()
            cliente.updated_at = datetime.utcnow()
            return True

    def crear_miro_board(self, cliente_id: int, data: MiroBoardCreate) -> dict | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            board = MiroBoard(
                cliente=cliente,
                titulo=_normalize_miro_titulo(data.titulo),
                url=data.url.strip(),
            )
            cliente.updated_at = datetime.utcnow()
            flush()
            return _miro_board_to_dict(board)

    def actualizar_miro_board(self, cliente_id: int, miro_id: int, patch: MiroBoardPatch) -> dict | None:
        payload = patch.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar.")

        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            board = MiroBoard.get(id=miro_id, cliente=cliente)
            if not board:
                return None

            for field, value in payload.items():
                if isinstance(value, str):
                    value = value.strip()
                    if field == "titulo":
                        value = _normalize_miro_titulo(value)
                setattr(board, field, value)

            cliente.updated_at = datetime.utcnow()
            flush()
            return _miro_board_to_dict(board)

    def eliminar_miro_board(self, cliente_id: int, miro_id: int) -> bool:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return False

            board = MiroBoard.get(id=miro_id, cliente=cliente)
            if not board:
                return False

            board.delete()
            cliente.updated_at = datetime.utcnow()
            return True

    def crear_fathom_board(self, cliente_id: int, data: FathomBoardCreate) -> dict | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            board = FathomBoard(
                cliente=cliente,
                titulo=_normalize_board_titulo(data.titulo),
                url=data.url.strip(),
            )
            cliente.updated_at = datetime.utcnow()
            flush()
            return _fathom_board_to_dict(board)

    def actualizar_fathom_board(self, cliente_id: int, fathom_id: int, patch: FathomBoardPatch) -> dict | None:
        payload = patch.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar.")

        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            board = FathomBoard.get(id=fathom_id, cliente=cliente)
            if not board:
                return None

            for field, value in payload.items():
                if isinstance(value, str):
                    value = value.strip()
                    if field == "titulo":
                        value = _normalize_board_titulo(value)
                setattr(board, field, value)

            cliente.updated_at = datetime.utcnow()
            flush()
            return _fathom_board_to_dict(board)

    def eliminar_fathom_board(self, cliente_id: int, fathom_id: int) -> bool:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return False

            board = FathomBoard.get(id=fathom_id, cliente=cliente)
            if not board:
                return False

            board.delete()
            cliente.updated_at = datetime.utcnow()
            return True

    async def crear_discord_transcript(
        self,
        cliente_id: int,
        file: UploadFile,
        titulo: str | None = None,
    ) -> dict | None:
        filename = (file.filename or "").strip()
        if not filename.lower().endswith(".txt"):
            raise HTTPException(status_code=400, detail="Solo se permiten archivos .txt.")

        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="El archivo está vacío.")
        if len(content) > MAX_DISCORD_TXT_BYTES:
            raise HTTPException(status_code=400, detail="El archivo supera el límite de 5 MB.")

        display_titulo = _normalize_board_titulo(titulo.strip()) if titulo and titulo.strip() else _normalize_board_titulo(
            Path(filename).stem
        )
        canal_slug = display_titulo.lower().replace(" ", "-")
        hoy = date.today()
        categoria = "manual"

        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            target_dir = _discord_client_dir(cliente_id)
            target_dir.mkdir(parents=True, exist_ok=True)
            target_path = target_dir / f"{hoy.isoformat()}-{uuid.uuid4().hex}.txt"
            target_path.write_bytes(content)

            existente = DiscordTranscript.get(canal=canal_slug, fecha=hoy)
            if existente:
                existente.filepath = str(target_path)
                existente.mensajes = 0
                existente.cliente = cliente
                transcript = existente
            else:
                transcript = DiscordTranscript(
                    cliente=cliente,
                    canal=canal_slug,
                    categoria=categoria,
                    fecha=hoy,
                    filepath=str(target_path),
                    mensajes=0,
                )
            cliente.updated_at = datetime.utcnow()
            flush()
            return _discord_transcript_to_dict(transcript)

    def actualizar_discord_transcript(self, cliente_id: int, transcript_id: int, canal: str) -> dict | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            transcript = DiscordTranscript.get(id=transcript_id, cliente=cliente)
            if not transcript:
                return None

            transcript.canal = _normalize_board_titulo(canal).lower().replace(" ", "-")
            cliente.updated_at = datetime.utcnow()
            flush()
            return _discord_transcript_to_dict(transcript)

    def eliminar_discord_transcript(self, cliente_id: int, transcript_id: int) -> bool:
        filepath: str | None = None
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return False

            transcript = DiscordTranscript.get(id=transcript_id, cliente=cliente)
            if not transcript:
                return False

            filepath = transcript.filepath
            transcript.delete()
            cliente.updated_at = datetime.utcnow()

        if filepath:
            file_path = Path(filepath)
            if file_path.exists():
                file_path.unlink()
        return True

    def obtener_discord_transcript_archivo(self, cliente_id: int, transcript_id: int) -> tuple[Path, str] | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            transcript = DiscordTranscript.get(id=transcript_id, cliente=cliente)
            if not transcript:
                return None

            file_path = Path(transcript.filepath)
            if not file_path.exists():
                return None

            return file_path, file_path.name

    def crear_documento_link(self, cliente_id: int, data: DocumentoLinkCreate) -> dict | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            link = DocumentoLink(
                cliente=cliente,
                titulo=_normalize_board_titulo(data.titulo),
                url=data.url.strip(),
            )
            cliente.updated_at = datetime.utcnow()
            flush()
            return _documento_link_to_dict(link)

    def actualizar_documento_link(self, cliente_id: int, link_id: int, patch: DocumentoLinkPatch) -> dict | None:
        payload = patch.model_dump(exclude_unset=True)
        if not payload:
            raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar.")

        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            link = DocumentoLink.get(id=link_id, cliente=cliente)
            if not link:
                return None

            for field, value in payload.items():
                if isinstance(value, str):
                    value = value.strip()
                    if field == "titulo":
                        value = _normalize_board_titulo(value)
                setattr(link, field, value)

            cliente.updated_at = datetime.utcnow()
            flush()
            return _documento_link_to_dict(link)

    def eliminar_documento_link(self, cliente_id: int, link_id: int) -> bool:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return False

            link = DocumentoLink.get(id=link_id, cliente=cliente)
            if not link:
                return False

            link.delete()
            cliente.updated_at = datetime.utcnow()
            return True

    def listar_discord_transcripts_cliente(self, cliente_id: int) -> list[dict] | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            transcripts = sorted(
                [
                    t for t in DiscordTranscript.select()
                    if t.cliente is not None and t.cliente.id == cliente_id
                ],
                key=lambda t: t.creado_en or datetime.min,
                reverse=True,
            )
            return [_discord_transcript_agent_list_dict(t) for t in transcripts]

    def obtener_discord_transcript_contenido(self, cliente_id: int, transcript_id: int) -> dict | None:
        with db_session:
            cliente = Cliente.get(id=cliente_id)
            if not cliente:
                return None

            transcript = DiscordTranscript.get(id=transcript_id, cliente=cliente)
            if not transcript:
                return None

            file_path = Path(transcript.filepath)
            if not file_path.exists():
                return None

            return {
                "id": transcript.id,
                "canal": transcript.canal,
                "fecha": transcript.fecha,
                "mensajes": transcript.mensajes or 0,
                "contenido": file_path.read_text(encoding="utf-8"),
            }
