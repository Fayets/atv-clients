"""
Una sola corrida: recorre el historial completo de cada canal de cliente y
(1) llena el directorio id→nombre con todos los autores y mencionados,
(2) descarga las imágenes que todavía no caducaron en Discord.

No toca los .txt, ni los cursores, ni la base. Se puede correr las veces que
haga falta. Uso (en el server):

    docker compose exec backend python backfill_directorio_adjuntos.py
"""

import asyncio
import logging

import discord
from decouple import config

from src.discord_bot import _categoria_de_canal
from src.services.discord_service import (
    descargar_adjuntos,
    registrar_en_directorio,
    registrar_mensaje_en_directorio,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("backfill")

TOKEN = config("DISCORD_BOT_TOKEN")
GUILD_ID = int(config("DISCORD_GUILD_ID"))

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
client = discord.Client(intents=intents)


@client.event
async def on_ready() -> None:
    guild = client.get_guild(GUILD_ID)
    if guild is None:
        log.error("Guild no encontrado")
        await client.close()
        return

    registrar_en_directorio(
        roles={str(r.id): r.name for r in guild.roles},
        canales={str(c.id): c.name for c in guild.text_channels},
    )

    canales = [c for c in guild.text_channels if _categoria_de_canal(c)]
    log.info("Canales a recorrer: %s", len(canales))
    total_msgs = 0
    for i, canal in enumerate(canales, 1):
        categoria = _categoria_de_canal(canal)
        n = 0
        try:
            async for msg in canal.history(limit=None, oldest_first=True):
                if msg.author.bot:
                    continue
                registrar_mensaje_en_directorio(msg)
                if msg.attachments:
                    await descargar_adjuntos(msg, categoria, canal.name)
                n += 1
        except discord.Forbidden:
            log.warning("Sin permisos: #%s", canal.name)
        except Exception as e:  # noqa: BLE001
            log.error("Error en #%s: %s", canal.name, e)
        total_msgs += n
        log.info("[%s/%s] #%s → %s mensajes", i, len(canales), canal.name, n)
        await asyncio.sleep(0.3)

    log.info("Listo: %s mensajes leídos en %s canales.", total_msgs, len(canales))
    await client.close()


if __name__ == "__main__":
    client.run(TOKEN, log_handler=None)
