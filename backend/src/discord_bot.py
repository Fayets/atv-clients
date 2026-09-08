import asyncio
import logging
from datetime import datetime, timezone

import discord
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from decouple import config

from src.services.discord_service import (
    descargar_adjuntos,
    detectar_categoria,
    guardar_mensaje_en_vivo,
    reemplazar_canales_cliente,
    registrar_en_directorio,
    sync_canal,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)

logger = logging.getLogger("discord_bot")

DISCORD_BOT_TOKEN = config("DISCORD_BOT_TOKEN", default="")
DISCORD_GUILD_ID = int(config("DISCORD_GUILD_ID", default="0"))
HORAS_LOOKBACK = 3

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True

_client = discord.Client(intents=intents)
_scheduler = AsyncIOScheduler()
_canal_activo: str = ""

# Un candado por canal: el barrido programado y el modo en vivo nunca escriben
# el mismo .txt al mismo tiempo, así el cursor no se pisa ni se duplican líneas.
_locks: dict[str, asyncio.Lock] = {}


def _lock_canal(nombre: str) -> asyncio.Lock:
    lock = _locks.get(nombre)
    if lock is None:
        lock = asyncio.Lock()
        _locks[nombre] = lock
    return lock


def _categoria_de_canal(canal: discord.abc.GuildChannel) -> str | None:
    """Categoría del bot para un canal ('boost', 'advantage', 'mentoria', 'updates') o None."""
    if not isinstance(canal, discord.TextChannel):
        return None
    if canal.category:
        slug = detectar_categoria(canal.category.name)
        if slug:
            return slug
    if "updates" in canal.name.lower():
        return "updates"
    return None


async def _extraer_canal(canal: discord.TextChannel, categoria: str) -> None:
    global _canal_activo
    async with _lock_canal(canal.name):
        _canal_activo = canal.name
        try:
            await sync_canal(canal, categoria)
        finally:
            _canal_activo = ""


async def _ciclo() -> None:
    logger.info(f"[{datetime.now().strftime('%H:%M')}] Iniciando ciclo Discord...")
    guild = _client.get_guild(DISCORD_GUILD_ID)
    if not guild:
        logger.error("Guild no encontrado")
        return

    # Roles y canales del guild al directorio: no necesitan intent members.
    try:
        registrar_en_directorio(
            roles={str(r.id): r.name for r in guild.roles},
            canales={str(c.id): c.name for c in guild.text_channels},
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Directorio (guild): {e}")

    # Foto de los canales de cliente de este ciclo: es lo que define "vivo" en ATV Ops.
    canales_cliente: dict[str, str] = {}
    for category in guild.categories:
        slug = detectar_categoria(category.name)
        if slug:
            for canal in category.text_channels:
                canales_cliente[canal.name] = slug
    for c in guild.text_channels:
        if "updates" in c.name.lower():
            canales_cliente[c.name] = "updates"
    try:
        reemplazar_canales_cliente(canales_cliente)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Directorio (canales cliente): {e}")

    procesados = 0
    for category in guild.categories:
        slug = detectar_categoria(category.name)
        if not slug:
            continue
        for canal in category.text_channels:
            await _extraer_canal(canal, slug)
            procesados += 1
            await asyncio.sleep(0.5)

    # Canal especial: #updates (no pertenece a ninguna categoría de cliente)
    canal_updates = next(
        (c for c in guild.text_channels if "updates" in c.name.lower()),
        None
    )
    if canal_updates:
        await _extraer_canal(canal_updates, "updates")
        procesados += 1

    logger.info(f"Ciclo completado — {procesados} canales procesados.")


@_client.event
async def on_message(message: discord.Message) -> None:
    """Modo en vivo: cada mensaje de un canal de cliente va al .txt al instante.
    El barrido programado sigue igual y queda como red de seguridad: si el bot
    estuvo caído, el próximo ciclo completa por cursor lo que faltó."""
    if message.author.bot or message.guild is None or message.guild.id != DISCORD_GUILD_ID:
        return
    categoria = _categoria_de_canal(message.channel)
    if not categoria:
        return
    try:
        async with _lock_canal(message.channel.name):
            await descargar_adjuntos(message, categoria, message.channel.name)
            escrito = await asyncio.to_thread(
                guardar_mensaje_en_vivo, message.channel, categoria, message
            )
        if escrito:
            logger.info(f"⚡ #{message.channel.name} → 1 msg en vivo")
    except Exception as e:
        logger.error(f"Error en vivo #{message.channel.name}: {e}", exc_info=True)


@_client.event
async def on_ready() -> None:
    logger.info(f"Discord bot listo: {_client.user}")
    await _ciclo()
    AR = pytz.timezone("America/Argentina/Buenos_Aires")
    for hora, minuto in [(9, 0), (10, 0), (13, 0), (16, 0), (18, 45), (23, 59)]:
        _scheduler.add_job(
            _ciclo, "cron",
            hour=hora, minute=minuto,
            timezone=AR,
        )
    _scheduler.start()


def get_guild() -> discord.Guild | None:
    return _client.get_guild(DISCORD_GUILD_ID)


def start_discord_bot() -> None:
    """Lanzar como task asyncio desde el lifespan de FastAPI."""
    if not DISCORD_BOT_TOKEN or not DISCORD_GUILD_ID:
        logger.warning("DISCORD_BOT_TOKEN o DISCORD_GUILD_ID no configurados — bot deshabilitado")
        return
    print(">>> Iniciando Discord bot...", flush=True)
    loop = asyncio.get_running_loop()
    loop.create_task(_client.start(DISCORD_BOT_TOKEN))


async def trigger_cliente(canal_name: str, categoria: str) -> None:
    """Fuerza la extracción de un canal específico."""
    guild = _client.get_guild(DISCORD_GUILD_ID)
    if not guild:
        logger.error("Guild no encontrado para trigger_cliente")
        return

    canal_discord = discord.utils.get(guild.text_channels, name=canal_name)
    if not canal_discord:
        logger.warning(f"Canal #{canal_name} no encontrado en Discord")
        return

    await _extraer_canal(canal_discord, categoria)
    logger.info(f"Trigger manual completado para #{canal_name}")
