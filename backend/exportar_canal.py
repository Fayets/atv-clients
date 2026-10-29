"""
Una sola corrida: baja el historial completo de un canal de Discord que NO es de un
cliente (por ejemplo #wins) con el mismo formato de los transcripts, para llevarlo al
classroom. Guarda también las imágenes (las de Discord caducan; recién bajadas, no).

Escribe en <transcripts>/comunidad/<canal>/<canal>.txt y su carpeta adjuntos/.
No toca la base ni los transcripts de clientes. Se puede correr las veces que haga
falta (reescribe el .txt). Uso (en el server):

    docker compose exec backend python exportar_canal.py wins

El nombre se compara sin emojis ni separadores ("🏆︙wins" = "wins"). Si hay más de
un canal con ese nombre, lista los candidatos y pide el id: exportar_canal.py --id=123
"""

import logging
import re
import sys

import discord
from decouple import config

from src.services.discord_service import (
    TRANSCRIPTS_BASE,
    _format_mensaje,
    _write_header,
    descargar_adjuntos,
    mensaje_a_dict,
    registrar_en_directorio,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
log = logging.getLogger("exportar")

TOKEN = config("DISCORD_BOT_TOKEN")
GUILD_ID = int(config("DISCORD_GUILD_ID"))
CATEGORIA = "comunidad"

intents = discord.Intents.default()
intents.message_content = True
intents.guilds = True
client = discord.Client(intents=intents)

args = [a for a in sys.argv[1:] if not a.startswith("--")]
buscado_id = next((int(a.split("=", 1)[1]) for a in sys.argv[1:] if a.startswith("--id=")), None)
buscado = args[0] if args else None


def _simple(nombre: str) -> str:
    """El nombre sin emojis ni separadores decorativos: "🏆︙wins" → "wins"."""
    return re.sub(r"^[^a-z0-9]+", "", nombre.lower()).strip("-")


@client.event
async def on_ready() -> None:
    try:
        guild = client.get_guild(GUILD_ID)
        if guild is None:
            log.error("Guild no encontrado")
            return
        if buscado_id:
            candidatos = [c for c in guild.text_channels if c.id == buscado_id]
        else:
            candidatos = [c for c in guild.text_channels if _simple(c.name) == _simple(buscado or "")]
        if len(candidatos) != 1:
            log.error("Canales que coinciden: %s", len(candidatos))
            for c in guild.text_channels:
                if buscado and _simple(buscado) in _simple(c.name):
                    log.error("  id=%s  #%s  (categoría: %s)", c.id, c.name, c.category.name if c.category else "-")
            log.error("Elegí uno con --id=<id>")
            return
        canal = candidatos[0]
        nombre = _simple(canal.name) or str(canal.id)
        registrar_en_directorio(
            roles={str(r.id): r.name for r in guild.roles},
            canales={str(c.id): c.name for c in guild.text_channels},
        )
        mensajes = []
        async for msg in canal.history(limit=None, oldest_first=True):
            if msg.author.bot:
                continue
            await descargar_adjuntos(msg, CATEGORIA, nombre)
            mensajes.append(mensaje_a_dict(msg))
            if len(mensajes) % 200 == 0:
                log.info("  %s mensajes…", len(mensajes))
        carpeta = TRANSCRIPTS_BASE / CATEGORIA / nombre
        carpeta.mkdir(parents=True, exist_ok=True)
        ruta = carpeta / f"{nombre}.txt"
        with open(ruta, "w", encoding="utf-8") as f:
            _write_header(f, canal.name, CATEGORIA, len(mensajes))
            f.write("".join(_format_mensaje(m) for m in mensajes))
        imagenes = len(list((carpeta / "adjuntos").glob("*"))) if (carpeta / "adjuntos").exists() else 0
        desde = mensajes[0]["timestamp"].strftime("%d/%m/%Y") if mensajes else "-"
        hasta = mensajes[-1]["timestamp"].strftime("%d/%m/%Y") if mensajes else "-"
        log.info("Listo: #%s → %s mensajes (%s a %s), %s imágenes → %s", canal.name, len(mensajes), desde, hasta, imagenes, ruta)
    except discord.Forbidden:
        log.error("El bot no tiene permiso para leer ese canal")
    finally:
        await client.close()


if __name__ == "__main__":
    if not buscado and not buscado_id:
        print(__doc__)
        sys.exit(1)
    client.run(TOKEN, log_handler=None)
