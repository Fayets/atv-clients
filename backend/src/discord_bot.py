import asyncio
import logging
from datetime import datetime, timezone

import discord
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from decouple import config

from src.services.discord_service import (
    detectar_categoria,
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


async def _extraer_canal(canal: discord.TextChannel, categoria: str) -> None:
    global _canal_activo
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

    procesados = 0
    for category in guild.categories:
        slug = detectar_categoria(category.name)
        if not slug:
            continue
        for canal in category.text_channels:
            await _extraer_canal(canal, slug)
            procesados += 1
            await asyncio.sleep(0.5)

    logger.info(f"Ciclo completado — {procesados} canales procesados.")


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
