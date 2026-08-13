from datetime import date, datetime, timezone, timedelta
from pathlib import Path
import asyncio
import logging
import re
import unicodedata
from difflib import SequenceMatcher
from decimal import Decimal

import discord
from pony.orm import db_session, flush

from src.models import Cliente, DiscordTranscript
from src.discord_transcript_paths import (
    canonical_transcript_filepath,
    get_transcripts_base,
)

logger = logging.getLogger("discord_bot")

_sync_todos_state: dict = {
    "status": "idle",
    "started_at": None,
    "finished_at": None,
    "canales_procesados": 0,
    "result": None,
    "error": None,
}


def _now_ar():
    """Hora actual en Argentina (UTC-3)."""
    utc_now = datetime.now(timezone.utc)
    ar_offset = timedelta(hours=-3)
    ar_now = utc_now + ar_offset
    return ar_now.replace(tzinfo=None)


TRANSCRIPTS_BASE = get_transcripts_base()

CATEGORIAS = {
    "boost": ["canales atv boost"],
    "advantage": ["canales atv adva", "canales atv advantage"],
    "mentoria": ["canales privados"],
}

DURACION_POR_PLAN = {"boost": 240, "mentoria": 120, "advantage": 120}


def detectar_categoria(category_name: str) -> str | None:
    """Retorna 'boost', 'advantage', 'mentoria' o None."""
    import re
    # Eliminar emojis y caracteres especiales, pasar a minúsculas
    name = re.sub(r'[^\w\s]', '', category_name).lower().strip()
    # Colapsar espacios múltiples
    name = re.sub(r'\s+', ' ', name)
    for slug, keywords in CATEGORIAS.items():
        for kw in keywords:
            if kw in name:
                return slug
    return None


def canal_a_nombre(canal_name: str) -> str:
    """
    'katherine-lindo'   → 'Katherine Lindo'
    'benat-y-vicente'   → 'Benat y Vicente'
    'tomas-valen-lauti' → 'Tomas Valen Lauti'
    """
    partes = canal_name.split("-")
    return " ".join(p if p.lower() == "y" else p.capitalize() for p in partes)


def nombre_a_slug(nombre: str) -> str:
    normalizado = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", normalizado).strip("-")


def _slug_similar(a: str, b: str) -> bool:
    if a == b:
        return True
    return SequenceMatcher(None, a, b).ratio() >= 0.85


@db_session
def buscar_cliente(canal_name: str, plan: str | None = None) -> int | None:
    """Busca cliente en BD por nombre derivado del canal. Retorna id o None."""
    nombre = canal_a_nombre(canal_name)
    nombre_lower = nombre.lower()
    slug_canal = canal_name.lower()

    clientes = list(Cliente.select())
    if plan:
        filtered: list[Cliente] = []
        for c in clientes:
            if c.plan_actual == plan:
                filtered.append(c)
        clientes = filtered

    for c in clientes:
        if c.nombre.lower() == nombre_lower:
            return c.id

    for c in clientes:
        if nombre_a_slug(c.nombre) == slug_canal:
            return c.id

    fuzzy = [c for c in clientes if _slug_similar(nombre_a_slug(c.nombre), slug_canal)]
    if len(fuzzy) == 1:
        return fuzzy[0].id

    primera = nombre_lower.split()[0]
    candidatos = [c for c in clientes if primera in c.nombre.lower()]
    return candidatos[0].id if len(candidatos) == 1 else None


def listar_canales_guild(guild: discord.Guild) -> list[dict]:
    """Lista todos los canales de texto en categorías Boost/Mentoría/Advantage."""
    canales: list[dict] = []
    for category in guild.categories:
        slug = detectar_categoria(category.name)
        if not slug:
            continue
        for canal in category.text_channels:
            canales.append({
                "canal": canal.name,
                "categoria": slug,
                "plan": slug,
                "nombre": canal_a_nombre(canal.name),
            })
    canales.sort(key=lambda item: (item["categoria"], item["nombre"].lower()))
    return canales


def detectar_faltantes(guild: discord.Guild) -> list[dict]:
    """Canales de Discord que no tienen cliente en la base (mismo plan)."""
    faltantes: list[dict] = []
    for item in listar_canales_guild(guild):
        if buscar_cliente(item["canal"], item["plan"]):
            continue
        faltantes.append(item)
    return faltantes


@db_session
def _crear_cliente_desde_canal(canal: str, plan: str) -> dict:
    nombre = canal_a_nombre(canal)
    email = f"{canal}@discord.pendiente.atvos.io"
    fecha_inicio = date.today()
    duracion = DURACION_POR_PLAN[plan]
    cliente = Cliente(
        nombre=nombre,
        email=email,
        plan_actual=plan,
        fecha_inicio=fecha_inicio,
        duracion_dias=duracion,
        fecha_vencimiento=fecha_inicio + timedelta(days=duracion),
        estado_cliente="vigente",
        total_pagado_usd=Decimal("0"),
        total_adeudado_usd=Decimal("0"),
        observaciones=f"Creado automáticamente desde Discord #{canal}",
    )
    flush()
    return {
        "id": cliente.id,
        "nombre": cliente.nombre,
        "plan": plan,
        "canal": canal,
        "email": email,
    }


@db_session
def _vincular_transcripts(canal: str, cliente_id: int) -> int:
    vinculados = 0
    cliente = Cliente.get(id=cliente_id)
    if not cliente:
        return 0
    for transcript in DiscordTranscript.select():
        if transcript.canal != canal:
            continue
        if transcript.cliente is None or transcript.cliente.id != cliente_id:
            transcript.cliente = cliente
            vinculados += 1
    return vinculados


async def crear_clientes_faltantes(
    guild: discord.Guild,
    canales: list[str] | None = None,
) -> dict:
    """Crea clientes para canales de Discord sin match en la base."""
    faltantes = detectar_faltantes(guild)
    if canales:
        permitidos = set(canales)
        faltantes = [item for item in faltantes if item["canal"] in permitidos]

    creados: list[dict] = []
    for item in faltantes:
        cliente = _crear_cliente_desde_canal(item["canal"], item["plan"])
        _vincular_transcripts(item["canal"], cliente["id"])

        canal_discord = discord.utils.get(guild.text_channels, name=item["canal"])
        mensajes = 0
        if canal_discord:
            result = await sync_canal(canal_discord, item["plan"], cliente["id"])
            mensajes = result.get("mensajes", 0)
            await asyncio.sleep(0.5)

        creados.append({**cliente, "mensajes": mensajes})

    return {"creados": creados, "total": len(creados)}


@db_session
def obtener_ultimo_mensaje_id(canal_name: str) -> str | None:
    """ID del último mensaje procesado para un canal del bot (un registro por canal)."""
    rows: list[DiscordTranscript] = []
    for t in DiscordTranscript.select():
        if t.canal == canal_name and t.categoria != "manual":
            rows.append(t)
    if not rows:
        return None
    transcript = max(rows, key=lambda t: t.id)
    return transcript.ultimo_mensaje_id


def _format_mensaje(msg: dict) -> str:
    ts = msg["timestamp"].strftime("%Y-%m-%d %H:%M")
    lines = [f"[{ts}] {msg['author']}\n", f"{msg['content']}\n"]
    for att in msg.get("attachments", []):
        lines.append(f"  📎 {att}\n")
    lines.append("\n")
    return "".join(lines)


def _write_header(f, canal_name: str, categoria: str, total_mensajes: int) -> None:
    f.write(f"Canal:     #{canal_name}\n")
    f.write(f"Programa:  {categoria.upper()}\n")
    f.write(f"Extraído:  {datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
    f.write(f"Mensajes:  {total_mensajes}\n")
    f.write("=" * 60 + "\n\n")


@db_session
def _get_transcript_bot(canal_name: str) -> DiscordTranscript | None:
    rows: list[DiscordTranscript] = []
    for t in DiscordTranscript.select():
        if t.canal == canal_name and t.categoria != "manual":
            rows.append(t)
    if not rows:
        return None
    return max(rows, key=lambda t: t.id)


@db_session
def _transcript_bot_state(canal_name: str) -> tuple[bool, int]:
    """Retorna (append_mode, mensajes_previos) usando solo primitivos."""
    existente = _get_transcript_bot(canal_name)
    if not existente:
        return False, 0
    return bool(existente.ultimo_mensaje_id), existente.mensajes or 0


def guardar_transcript(
    canal_name: str,
    categoria: str,
    mensajes: list[dict],
    cliente_id: int | None,
) -> str:
    """Append de mensajes nuevos al .txt acumulativo y upsert en BD. Retorna filepath."""
    if not mensajes:
        raise ValueError("guardar_transcript requiere al menos un mensaje")

    append_mode, mensajes_previos = _transcript_bot_state(canal_name)

    carpeta = TRANSCRIPTS_BASE / categoria / canal_name
    carpeta.mkdir(parents=True, exist_ok=True)
    filepath = carpeta / f"{canal_name}.txt"

    ultimo_id = mensajes[-1]["id"]
    ahora = _now_ar()
    contenido = "".join(_format_mensaje(m) for m in mensajes)

    if append_mode:
        total_mensajes = mensajes_previos + len(mensajes)
        with open(filepath, "a", encoding="utf-8") as f:
            f.write(contenido)
    else:
        total_mensajes = len(mensajes)
        with open(filepath, "w", encoding="utf-8") as f:
            _write_header(f, canal_name, categoria, total_mensajes)
            f.write(contenido)

    _upsert_transcript(
        canal_name,
        categoria,
        canonical_transcript_filepath(categoria, canal_name),
        total_mensajes,
        ultimo_id,
        cliente_id,
        ahora,
    )

    return str(filepath)


@db_session
def _upsert_transcript(
    canal_name: str,
    categoria: str,
    filepath: str,
    total_mensajes: int,
    ultimo_mensaje_id: str,
    cliente_id: int | None,
    ahora: datetime,
) -> None:
    existente = _get_transcript_bot(canal_name)
    if existente:
        existente.mensajes = total_mensajes
        existente.filepath = filepath
        existente.ultimo_mensaje_id = ultimo_mensaje_id
        existente.creado_en = ahora
        existente.fecha = date.today()
        if cliente_id:
            cliente_obj = Cliente.get(id=cliente_id)
            if cliente_obj:
                existente.cliente = cliente_obj
    else:
        cliente_obj = Cliente.get(id=cliente_id) if cliente_id else None
        DiscordTranscript(
            cliente=cliente_obj,
            canal=canal_name,
            categoria=categoria,
            fecha=date.today(),
            filepath=filepath,
            mensajes=total_mensajes,
            ultimo_mensaje_id=ultimo_mensaje_id,
            creado_en=ahora,
        )


async def sync_canal(
    canal: discord.TextChannel,
    categoria: str,
    cliente_id: int | None = None,
) -> dict:
    """Extrae mensajes nuevos de un canal y los persiste."""
    base = {
        "canal": canal.name,
        "categoria": categoria,
        "mensajes": 0,
        "cliente_id": None,
        "nombre": canal_a_nombre(canal.name),
        "plan_actual": None,
    }
    try:
        mensajes = []
        ultimo_id = obtener_ultimo_mensaje_id(canal.name)
        history_kwargs: dict = {"limit": None, "oldest_first": True}
        if ultimo_id:
            history_kwargs["after"] = discord.Object(id=int(ultimo_id))

        async for msg in canal.history(**history_kwargs):
            if msg.author.bot:
                continue
            mensajes.append({
                "id": str(msg.id),
                "timestamp": msg.created_at,
                "author": msg.author.display_name,
                "content": msg.content or "",
                "attachments": [a.url for a in msg.attachments],
            })

        if not mensajes:
            return base

        cid = cliente_id if cliente_id is not None else buscar_cliente(canal.name, categoria)
        if not cid:
            logger.warning(f"Sin match de cliente para #{canal.name}")

        path = guardar_transcript(canal.name, categoria, mensajes, cid)
        logger.info(f"✓ #{canal.name} → {len(mensajes)} msgs → {path}")

        plan_actual = None
        nombre = canal_a_nombre(canal.name)
        if cid:
            with db_session:
                cliente = Cliente.get(id=cid)
                if cliente:
                    plan_actual = cliente.plan_actual
                    nombre = cliente.nombre

        return {
            "canal": canal.name,
            "categoria": categoria,
            "mensajes": len(mensajes),
            "cliente_id": cid,
            "nombre": nombre,
            "plan_actual": plan_actual,
        }

    except discord.Forbidden:
        logger.warning(f"Sin permisos: #{canal.name}")
        return base
    except Exception as e:
        logger.error(f"Error en #{canal.name}: {e}", exc_info=True)
        return base


def _set_sync_progress(canales_procesados: int) -> None:
    _sync_todos_state["canales_procesados"] = canales_procesados


def obtener_estado_sync_todos() -> dict:
    return {
        "ok": True,
        "status": _sync_todos_state["status"],
        "started_at": _sync_todos_state["started_at"],
        "finished_at": _sync_todos_state["finished_at"],
        "canales_procesados": _sync_todos_state["canales_procesados"],
        "result": _sync_todos_state["result"],
        "error": _sync_todos_state["error"],
    }


async def _run_sync_guild(guild: discord.Guild) -> None:
    try:
        result = await sync_guild(guild, on_progress=_set_sync_progress)
        _sync_todos_state["status"] = "done"
        _sync_todos_state["result"] = result
        _sync_todos_state["error"] = None
        _sync_todos_state["canales_procesados"] = result.get("canales_procesados", 0)
    except Exception as exc:
        logger.exception("Error en sincronización Discord masiva")
        _sync_todos_state["status"] = "error"
        _sync_todos_state["result"] = None
        _sync_todos_state["error"] = "Error al sincronizar Discord."
        logger.error("sync_guild falló: %s", exc)
    finally:
        _sync_todos_state["finished_at"] = datetime.utcnow().isoformat()


def iniciar_sync_guild(guild: discord.Guild) -> dict:
    if _sync_todos_state["status"] == "running":
        return obtener_estado_sync_todos()

    _sync_todos_state["status"] = "running"
    _sync_todos_state["started_at"] = datetime.utcnow().isoformat()
    _sync_todos_state["finished_at"] = None
    _sync_todos_state["canales_procesados"] = 0
    _sync_todos_state["result"] = None
    _sync_todos_state["error"] = None
    asyncio.create_task(_run_sync_guild(guild))
    return obtener_estado_sync_todos()


async def sync_guild(guild: discord.Guild, on_progress=None) -> dict:
    """Sincroniza todos los canales de Discord y resume clientes actualizados."""
    faltantes = detectar_faltantes(guild)
    actualizados: list[dict] = []
    sin_match: list[dict] = []
    canales_procesados = 0
    mensajes_totales = 0

    for category in guild.categories:
        slug = detectar_categoria(category.name)
        if not slug:
            continue
        for canal in category.text_channels:
            canales_procesados += 1
            if on_progress:
                on_progress(canales_procesados)
            result = await sync_canal(canal, slug)
            mensajes = result.get("mensajes", 0)
            if mensajes <= 0:
                await asyncio.sleep(0.5)
                continue

            mensajes_totales += mensajes
            item = {
                "canal": result["canal"],
                "categoria": result["categoria"],
                "mensajes": mensajes,
                "nombre": result["nombre"],
            }
            if result.get("cliente_id"):
                actualizados.append({
                    **item,
                    "cliente_id": result["cliente_id"],
                    "plan": result["plan_actual"],
                })
            else:
                sin_match.append({**item, "plan": slug})

            await asyncio.sleep(0.5)

    actualizados.sort(key=lambda item: item["nombre"].lower())
    sin_match.sort(key=lambda item: item["nombre"].lower())

    return {
        "canales_procesados": canales_procesados,
        "mensajes_totales": mensajes_totales,
        "actualizados": actualizados,
        "sin_match": sin_match,
        "faltantes": faltantes,
    }


async def sync_cliente(cliente_id: int, guild: discord.Guild) -> dict[str, int]:
    """Sincroniza transcripts solo para canales que matchean con el cliente."""
    canales = 0
    mensajes = 0

    for category in guild.categories:
        slug = detectar_categoria(category.name)
        if not slug:
            continue
        for canal in category.text_channels:
            if buscar_cliente(canal.name, slug) != cliente_id:
                continue
            canales += 1
            result = await sync_canal(canal, slug, cliente_id)
            mensajes += result.get("mensajes", 0)
            await asyncio.sleep(0.5)

    return {"canales": canales, "mensajes": mensajes}
