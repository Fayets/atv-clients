from datetime import date, datetime, timezone, timedelta
from pathlib import Path
import asyncio
import logging

import discord
from pony.orm import db_session

from src.models import Cliente, DiscordTranscript

logger = logging.getLogger("discord_bot")


def _now_ar():
    """Hora actual en Argentina (UTC-3)."""
    utc_now = datetime.now(timezone.utc)
    ar_offset = timedelta(hours=-3)
    ar_now = utc_now + ar_offset
    return ar_now.replace(tzinfo=None)


TRANSCRIPTS_BASE = Path("/opt/atv-clients/transcripts")

CATEGORIAS = {
    "boost": ["canales atv boost"],
    "advantage": ["canales atv adva", "canales atv advantage"],
    "mentoria": ["canales privados"],
}


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


@db_session
def buscar_cliente(canal_name: str) -> int | None:
    """Busca cliente en BD por nombre derivado del canal. Retorna id o None."""
    from src.models import Cliente
    nombre = canal_a_nombre(canal_name)
    nombre_lower = nombre.lower()

    # Buscar todos y filtrar en Python (evita lambda en Pony ORM con Python 3.12)
    clientes = Cliente.select()[:]

    # Match exacto
    for c in clientes:
        if c.nombre.lower() == nombre_lower:
            return c.id

    # Match por primera palabra
    primera = nombre_lower.split()[0]
    candidatos = [c for c in clientes if primera in c.nombre.lower()]
    return candidatos[0].id if len(candidatos) == 1 else None


@db_session
def obtener_ultimo_mensaje_id(canal_name: str) -> str | None:
    """ID del último mensaje procesado para un canal del bot (un registro por canal)."""
    rows = [
        t for t in DiscordTranscript.select()
        if t.canal == canal_name and t.categoria != "manual"
    ]
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
    rows = [
        t for t in DiscordTranscript.select()
        if t.canal == canal_name and t.categoria != "manual"
    ]
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
        str(filepath),
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
) -> int:
    """Extrae mensajes nuevos de un canal y los persiste. Retorna cantidad de mensajes nuevos."""
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
            return 0

        cid = cliente_id if cliente_id is not None else buscar_cliente(canal.name)
        if not cid:
            logger.warning(f"Sin match de cliente para #{canal.name}")

        path = guardar_transcript(canal.name, categoria, mensajes, cid)
        logger.info(f"✓ #{canal.name} → {len(mensajes)} msgs → {path}")
        return len(mensajes)

    except discord.Forbidden:
        logger.warning(f"Sin permisos: #{canal.name}")
        return 0
    except Exception as e:
        logger.error(f"Error en #{canal.name}: {e}", exc_info=True)
        return 0


async def sync_cliente(cliente_id: int, guild: discord.Guild) -> dict[str, int]:
    """Sincroniza transcripts solo para canales que matchean con el cliente."""
    canales = 0
    mensajes = 0

    for category in guild.categories:
        slug = detectar_categoria(category.name)
        if not slug:
            continue
        for canal in category.text_channels:
            if buscar_cliente(canal.name) != cliente_id:
                continue
            canales += 1
            mensajes += await sync_canal(canal, slug, cliente_id)
            await asyncio.sleep(0.5)

    return {"canales": canales, "mensajes": mensajes}
