from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime, time, timedelta, timezone

import pytz

from pony.orm import db_session, flush

from src.analisis_ia_claude import invocar_claude
from src.analisis_ia_prompt_maestro import PROMPT_MAESTRO
from src.analisis_ia_rules import filtrar_accionables
from src.discord_transcript_paths import resolve_transcript_filepath
from src.models import AnalisisIARun, Cliente, DiscordTranscript
from src.services.clientes_services import ClientesServices

logger = logging.getLogger("analisis_ia")

INTERVALO_DIAS = 2
PRIMER_ANALISIS_DIAS = 7
GUARD_DUPLICADO_MINUTOS = 45
AR = pytz.timezone("America/Argentina/Buenos_Aires")
# Horarios fijos AR — weekday Python (0=lu … 6=do), hora, minuto
HORARIOS_PROGRAMADOS_AR = (
    (6, 10, 0),    # domingo 10:00
    (1, 23, 10),   # martes 23:10
    (3, 18, 0),    # jueves 18:00
)
_lock = threading.Lock()
_en_ejecucion = False

CAMPOS_SCHEMA = frozenset({
    "categoria",
    "urgencia",
    "status_crm",
    "programa",
    "monto_usd",
    "confianza",
    "evidencia",
    "accion",
    "titulo",
    "senal",
    "tendencia",
    "frase_cliente",
    "logros",
    "accion_reunion",
    "resumen",
})
CATEGORIAS_VALIDAS = frozenset({"win", "upsell"})
URGENCIAS_VALIDAS = frozenset({"alta", "media", "baja"})
PROGRAMAS_VALIDOS = frozenset({"mentoria", "advantage", "boost"})

_clientes_service = ClientesServices()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive_utc_to_ar(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc).astimezone(AR)


def _ar_to_naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _calcular_proximo_slot(desde: datetime | None = None) -> datetime:
    """Próximo horario programado (dom 10:00, mar 23:10, jue 18:00 AR) estrictamente después de `desde`."""
    base_ar = _naive_utc_to_ar(desde or _utcnow())
    candidatos: list[datetime] = []
    for offset in range(8):
        dia = base_ar.date() + timedelta(days=offset)
        for dow, hour, minute in HORARIOS_PROGRAMADOS_AR:
            if dia.weekday() != dow:
                continue
            slot = AR.localize(datetime.combine(dia, time(hour, minute)))
            if slot > base_ar:
                candidatos.append(slot)
    if not candidatos:
        raise RuntimeError("No se encontró próximo slot de análisis IA")
    return _ar_to_naive_utc(min(candidatos))


def _fmt_ventana(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M")


_MSG_TS_RE = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\] ([^\n]+)\n", re.MULTILINE)


def _parse_mensajes_transcript(contenido: str) -> list[tuple[datetime, str]]:
    """Separa el .txt acumulativo en bloques por mensaje ([YYYY-MM-DD HH:MM] Autor)."""
    matches = list(_MSG_TS_RE.finditer(contenido))
    mensajes: list[tuple[datetime, str]] = []
    for i, match in enumerate(matches):
        ts = datetime.strptime(match.group(1), "%Y-%m-%d %H:%M")
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(contenido)
        block = contenido[start:end].rstrip() + "\n\n"
        mensajes.append((ts, block))
    return mensajes


def _filtrar_transcript_desde(contenido: str, desde: datetime) -> tuple[str, int]:
    """Retorna transcript recortado (solo msgs con ts > desde) y cantidad de mensajes."""
    nuevos = [(ts, block) for ts, block in _parse_mensajes_transcript(contenido) if ts > desde]
    filtrado = "".join(block for _, block in nuevos).strip()
    return filtrado, len(nuevos)


@db_session
def _mapa_ultimo_run_ok_por_cliente() -> dict[int, datetime]:
    """cliente_id → ejecutado_en del run OK más reciente que lo incluyó."""
    resultado: dict[int, datetime] = {}
    runs: list[AnalisisIARun] = []
    for run in AnalisisIARun.select():
        if run.estado == "ok" and run.resultados and run.ejecutado_en:
            runs.append(run)
    runs.sort(key=lambda r: r.ejecutado_en or datetime.min, reverse=True)
    for run in runs:
        for item in _parse_resultados(run.resultados):
            cid = item.get("cliente_id")
            if cid and cid not in resultado:
                resultado[cid] = run.ejecutado_en
    return resultado


def _cutoff_cliente(cliente_id: int, ultimo_ok: dict[int, datetime]) -> datetime:
    """Punto de corte: última corrida OK del cliente, o últimos PRIMER_ANALISIS_DIAS si es nuevo."""
    if cliente_id in ultimo_ok:
        return ultimo_ok[cliente_id]
    return _utcnow() - timedelta(days=PRIMER_ANALISIS_DIAS)


def _armar_user_prompt(
    nombre_cliente: str,
    programa: str,
    transcript: str,
    ventana_desde: datetime,
    ventana_hasta: datetime,
) -> str:
    return (
        f"Cliente: {nombre_cliente}\n"
        f"Programa actual: {programa}\n"
        f"Ventana de análisis (solo win/upsell con evidencia en este período): "
        f"{_fmt_ventana(ventana_desde)} → {_fmt_ventana(ventana_hasta)}\n"
        f"Transcript del canal Discord (solo mensajes nuevos desde la última corrida):\n"
        f"{transcript}"
    )


def _extraer_json(texto: str) -> dict:
    texto = texto.strip()
    if texto.startswith("```"):
        texto = re.sub(r"^```(?:json)?\s*", "", texto)
        texto = re.sub(r"\s*```$", "", texto)
    try:
        data = json.loads(texto)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", texto)
        if not match:
            raise ValueError("No se encontró JSON en la respuesta de Claude")
        data = json.loads(match.group())
    if not isinstance(data, dict):
        raise ValueError("La respuesta de Claude no es un objeto JSON")
    return data


def _validar_clasificacion(data: dict) -> dict:
    if set(data.keys()) != CAMPOS_SCHEMA:
        faltantes = CAMPOS_SCHEMA - set(data.keys())
        sobrantes = set(data.keys()) - CAMPOS_SCHEMA
        partes = []
        if faltantes:
            partes.append(f"faltan campos: {sorted(faltantes)}")
        if sobrantes:
            partes.append(f"campos extra: {sorted(sobrantes)}")
        raise ValueError("; ".join(partes) or "schema inválido")

    categoria = data["categoria"]
    if categoria is not None and categoria not in CATEGORIAS_VALIDAS:
        raise ValueError(f"categoria inválida: {categoria!r}")

    urgencia = data["urgencia"]
    if urgencia is not None and urgencia not in URGENCIAS_VALIDAS:
        raise ValueError(f"urgencia inválida: {urgencia!r}")

    programa = data["programa"]
    if programa not in PROGRAMAS_VALIDOS:
        raise ValueError(f"programa inválido: {programa!r}")

    monto = data["monto_usd"]
    if monto is not None and not isinstance(monto, (int, float)):
        raise ValueError("monto_usd debe ser number o null")

    confianza = data["confianza"]
    if confianza is not None and not isinstance(confianza, (int, float)):
        raise ValueError("confianza debe ser number o null")

    for campo in ("status_crm", "evidencia", "accion", "titulo", "senal", "tendencia", "frase_cliente", "accion_reunion", "resumen"):
        valor = data[campo]
        if valor is not None and not isinstance(valor, str):
            raise ValueError(f"{campo} debe ser string o null")

    logros = data["logros"]
    if logros is not None and not isinstance(logros, list):
        raise ValueError("logros debe ser array o null")
    if logros is not None:
        for i, item in enumerate(logros):
            if not isinstance(item, str):
                raise ValueError(f"logros[{i}] debe ser string")

    if categoria in CATEGORIAS_VALIDAS:
        for campo in ("titulo", "frase_cliente", "resumen", "accion_reunion"):
            if not data.get(campo):
                raise ValueError(f"{campo} es obligatorio cuando categoria es {categoria!r}")

    return data


def _clasificar_cliente(
    nombre_cliente: str,
    programa: str,
    transcript: str,
    ventana_desde: datetime,
    ventana_hasta: datetime,
) -> dict:
    user_prompt = _armar_user_prompt(
        nombre_cliente, programa, transcript, ventana_desde, ventana_hasta,
    )
    raw = invocar_claude(PROMPT_MAESTRO, user_prompt)
    parsed = _validar_clasificacion(_extraer_json(raw))
    return parsed


@db_session
def _listar_candidatos_transcript() -> list[dict]:
    """Clientes con transcript del bot vinculado y archivo legible."""
    por_cliente: dict[int, DiscordTranscript] = {}
    for transcript in DiscordTranscript.select():
        if transcript.categoria == "manual" or not transcript.cliente:
            continue
        if not transcript.filepath:
            continue
        resolved = resolve_transcript_filepath(transcript.filepath)
        if not resolved or not resolved.is_file():
            continue
        cliente_id = transcript.cliente.id
        previo = por_cliente.get(cliente_id)
        if previo is None or transcript.id > previo.id:
            por_cliente[cliente_id] = transcript

    candidatos: list[dict] = []
    for cliente_id, transcript in sorted(por_cliente.items()):
        cliente = Cliente.get(id=cliente_id)
        if not cliente:
            continue
        candidatos.append({
            "cliente_id": cliente_id,
            "cliente_nombre": cliente.nombre,
            "plan": cliente.plan_actual,
            "transcript_id": transcript.id,
        })
    return candidatos


def _leer_transcript(cliente_id: int, transcript_id: int) -> str | None:
    data = _clientes_service.obtener_discord_transcript_contenido(cliente_id, transcript_id)
    if not data:
        return None
    contenido = (data.get("contenido") or "").strip()
    return contenido or None


def _item_resultado(
    *,
    cliente_id: int,
    cliente_nombre: str,
    plan: str,
    clasificacion: dict,
    analizado_at: str,
) -> dict:
    senal = clasificacion.get("senal")
    return {
        "id": f"cliente-{cliente_id}",
        "cliente_id": cliente_id,
        "cliente_nombre": cliente_nombre,
        "plan": plan,
        "categoria": clasificacion["categoria"],
        "urgencia": clasificacion["urgencia"],
        "status_crm": clasificacion["status_crm"],
        "programa": clasificacion["programa"],
        "monto_usd": clasificacion["monto_usd"],
        "confianza": int(clasificacion["confianza"]) if clasificacion["confianza"] is not None else None,
        "evidencia": clasificacion["evidencia"],
        "accion": clasificacion["accion"],
        "titulo": clasificacion.get("titulo"),
        "señal": senal,
        "tendencia": clasificacion.get("tendencia"),
        "frase_cliente": clasificacion.get("frase_cliente"),
        "logros": clasificacion.get("logros") or [],
        "accion_reunion": clasificacion.get("accion_reunion"),
        "resumen": clasificacion.get("resumen"),
        "analizado_at": analizado_at,
    }


def _analizar_transcripts() -> tuple[list[dict], list[dict], int, int, str | None]:
    candidatos = _listar_candidatos_transcript()
    if not candidatos:
        logger.warning("Análisis IA: no hay clientes con transcript del bot disponible.")
        return [], [], 0, 0, None

    ultimo_ok_por_cliente = _mapa_ultimo_run_ok_por_cliente()
    ventana_hasta = _utcnow()
    logger.info(
        "Análisis IA: %s candidatos con archivo; filtro por última corrida OK por cliente "
        "(default %s días si es primera vez)",
        len(candidatos),
        PRIMER_ANALISIS_DIAS,
    )

    ahora = _utcnow().isoformat()
    crudo: list[dict] = []
    clientes_procesados = 0
    clientes_con_error = 0
    primer_error: str | None = None

    for candidato in candidatos:
        nombre = candidato["cliente_nombre"]
        cliente_id = candidato["cliente_id"]
        plan = candidato["plan"]
        transcript_id = candidato["transcript_id"]

        contenido_completo = _leer_transcript(cliente_id, transcript_id)
        if not contenido_completo:
            logger.warning("Análisis IA: transcript vacío o ilegible para %s (id=%s)", nombre, cliente_id)
            continue

        cutoff = _cutoff_cliente(cliente_id, ultimo_ok_por_cliente)
        contenido, msgs_nuevos = _filtrar_transcript_desde(contenido_completo, cutoff)
        if not contenido or msgs_nuevos == 0:
            logger.info(
                "Análisis IA: %s (id=%s) — sin mensajes nuevos desde %s, omitido",
                nombre,
                cliente_id,
                _fmt_ventana(cutoff),
            )
            continue

        logger.info(
            "Análisis IA: %s (id=%s) — %s msgs nuevos desde %s, transcript %s → %s chars",
            nombre,
            cliente_id,
            msgs_nuevos,
            _fmt_ventana(cutoff),
            len(contenido_completo),
            len(contenido),
        )

        clientes_procesados += 1
        try:
            clasificacion = _clasificar_cliente(
                nombre, plan, contenido, cutoff, ventana_hasta,
            )
            crudo.append(_item_resultado(
                cliente_id=cliente_id,
                cliente_nombre=nombre,
                plan=plan,
                clasificacion=clasificacion,
                analizado_at=ahora,
            ))
        except Exception as exc:
            clientes_con_error += 1
            if primer_error is None:
                primer_error = str(exc)
            logger.error("Análisis IA: error clasificando %s (id=%s): %s", nombre, cliente_id, exc)

    visibles = filtrar_accionables(crudo)
    return crudo, visibles, clientes_procesados, clientes_con_error, primer_error


@db_session
def _ultimo_run_ok() -> AnalisisIARun | None:
    runs: list[AnalisisIARun] = []
    for run in AnalisisIARun.select():
        if run.estado == "ok":
            runs.append(run)
    if not runs:
        return None
    return max(runs, key=lambda run: run.ejecutado_en or datetime.min)


@db_session
def _ultimo_run() -> AnalisisIARun | None:
    runs: list[AnalisisIARun] = []
    for run in AnalisisIARun.select():
        runs.append(run)
    if not runs:
        return None
    return max(runs, key=lambda run: run.ejecutado_en or datetime.min)


@db_session
def es_primera_vez() -> bool:
    for _ in AnalisisIARun.select():
        return False
    return True


@db_session
def _guardar_run(
    *,
    estado: str,
    resultados: list[dict] | None,
    error: str | None,
    origen: str,
    ejecutado_en: datetime,
    total_analizados: int | None = None,
    requieren_accion: int | None = None,
    clientes_procesados: int | None = None,
    clientes_con_error: int | None = None,
) -> AnalisisIARun:
    proximo = _calcular_proximo_slot(ejecutado_en) if estado == "ok" else None
    payload: dict = {
        "ejecutado_en": ejecutado_en,
        "estado": estado,
        "origen": origen,
    }
    if proximo is not None:
        payload["proximo_analisis_en"] = proximo
    if resultados is not None:
        payload["resultados"] = json.dumps(resultados, ensure_ascii=False)
    if error:
        payload["error"] = error
    if total_analizados is not None:
        payload["total_analizados"] = total_analizados
    if requieren_accion is not None:
        payload["requieren_accion"] = requieren_accion
    if clientes_procesados is not None:
        payload["clientes_procesados"] = clientes_procesados
    if clientes_con_error is not None:
        payload["clientes_con_error"] = clientes_con_error
    run = AnalisisIARun(**payload)
    flush()
    return run


def _parse_resultados(raw: str | None) -> list[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def obtener_estado() -> dict:
    global _en_ejecucion
    with db_session:
        ultimo = _ultimo_run_ok()
        ultimo_en = ultimo.ejecutado_en if ultimo else None
        proximo_en = _calcular_proximo_slot(_utcnow())
        origen = ultimo.origen if ultimo else None
        todos = _parse_resultados(ultimo.resultados if ultimo else None)
        resultados = filtrar_accionables(todos)
        total = ultimo.total_analizados if ultimo and ultimo.total_analizados is not None else len(todos)
        accion = ultimo.requieren_accion if ultimo and ultimo.requieren_accion is not None else len(resultados)

    return {
        "ultimo_analisis_en": ultimo_en,
        "proximo_analisis_en": proximo_en,
        "intervalo_dias": INTERVALO_DIAS,
        "en_ejecucion": _en_ejecucion,
        "origen": origen,
        "total_analizados": total,
        "requieren_accion": accion,
        "clientes_analizados": todos,
        "resultados": resultados,
        "error": None,
    }


def puede_ejecutar_programado() -> bool:
    """Guard mínimo anti doble disparo; el cron fija el horario real."""
    if _en_ejecucion:
        return False
    with db_session:
        ultimo = _ultimo_run()
    if ultimo and ultimo.ejecutado_en:
        delta = _utcnow() - ultimo.ejecutado_en
        if delta < timedelta(minutes=GUARD_DUPLICADO_MINUTOS):
            return False
    return True


def ejecutar(origen: str = "programado") -> dict:
    global _en_ejecucion

    if not _lock.acquire(blocking=False):
        return {**obtener_estado(), "error": "Ya hay un análisis en ejecución."}

    _en_ejecucion = True
    ejecutado_en = _utcnow()
    try:
        logger.info("Iniciando análisis IA (%s)...", origen)
        crudo, visibles, clientes_procesados, clientes_con_error, primer_error = _analizar_transcripts()
        fallo_total = (
            clientes_procesados > 0
            and clientes_con_error == clientes_procesados
        )
        estado = "error" if fallo_total else "ok"
        _guardar_run(
            estado=estado,
            resultados=crudo,
            error=primer_error if fallo_total else None,
            origen=origen,
            ejecutado_en=ejecutado_en,
            total_analizados=len(crudo),
            requieren_accion=len(visibles),
            clientes_procesados=clientes_procesados,
            clientes_con_error=clientes_con_error,
        )
        if fallo_total:
            logger.error(
                "Análisis IA falló para todos los clientes (%s/%s) — %s",
                clientes_con_error,
                clientes_procesados,
                primer_error,
            )
        else:
            logger.info(
                "Análisis IA completado — %s analizados, %s requieren acción, %s errores de %s procesados",
                len(crudo),
                len(visibles),
                clientes_con_error,
                clientes_procesados,
            )
        return obtener_estado()
    except Exception as exc:
        logger.exception("Error en análisis IA")
        _guardar_run(
            estado="error",
            resultados=None,
            error=str(exc),
            origen=origen,
            ejecutado_en=ejecutado_en,
        )
        estado = obtener_estado()
        estado["error"] = str(exc)
        return estado
    finally:
        _en_ejecucion = False
        _lock.release()
