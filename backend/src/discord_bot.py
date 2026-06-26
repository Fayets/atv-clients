import asyncio
import logging
from datetime import datetime, timezone

import discord
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from decouple import config

from src.services.discord_service import (
    buscar_cliente,
    detectar_categoria,
    guardar_transcript,
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
_bot_running: bool = False


async def _extraer_canal(canal: discord.TextChannel, categoria: str) -> None:
    try:
        mensajes = []

        async for msg in canal.history(limit=None, oldest_first=True):
            if msg.author.bot:
                continue
            mensajes.append({
                "timestamp": msg.created_at,
                "author": msg.author.display_name,
                "content": msg.content or "",
                "attachments": [a.url for a in msg.attachments],
            })

        if not mensajes:
            return

        cliente_id = buscar_cliente(canal.name)
        if not cliente_id:
            logger.warning(f"Sin match de cliente para #{canal.name}")

        path = guardar_transcript(canal.name, categoria, mensajes, cliente_id)
        logger.info(f"✓ #{canal.name} → {len(mensajes)} msgs → {path}")

    except discord.Forbidden:
        logger.warning(f"Sin permisos: #{canal.name}")
    except Exception as e:
        logger.error(f"Error en #{canal.name}: {e}", exc_info=True)


async def _ciclo() -> None:
    global _bot_running
    _bot_running = True
    logger.info(f"[{datetime.now().strftime('%H:%M')}] Iniciando ciclo Discord...")
    guild = _client.get_guild(DISCORD_GUILD_ID)
    if not guild:
        logger.error("Guild no encontrado")
        _bot_running = False
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
    _bot_running = False


@_client.event
async def on_ready() -> None:
    logger.info(f"Discord bot listo: {_client.user}")
    await _ciclo()
    _scheduler.add_job(_ciclo, "interval", hours=3)
    _scheduler.start()


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
    global _bot_running
    guild = _client.get_guild(DISCORD_GUILD_ID)
    if not guild:
        logger.error("Guild no encontrado para trigger_cliente")
        return

    canal_discord = discord.utils.get(guild.text_channels, name=canal_name)
    if not canal_discord:
        logger.warning(f"Canal #{canal_name} no encontrado en Discord")
        return

    _bot_running = True
    try:
        await _extraer_canal(canal_discord, categoria)
        logger.info(f"Trigger manual completado para #{canal_name}")
    finally:
        _bot_running = False
