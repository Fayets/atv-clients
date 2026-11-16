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

Categorías enteras (los canales archivados de clientes, "❌ Canales inactivos 1…7"):

    docker compose exec backend python exportar_canal.py --categoria="canales inactivos"

Baja cada canal de cada categoría cuyo nombre contenga ese texto a
<transcripts>/inactivos/<n>/<canal>/<canal>.txt (n = el número de la categoría) y deja
<transcripts>/inactivos/resumen.json con categoría → canales, mensajes y fechas.
"""

import json
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
buscada_categoria = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--categoria=")), None)


def _simple(nombre: str) -> str:
    """El nombre sin emojis ni separadores decorativos: "🏆︙wins" → "wins"."""
    return re.sub(r"^[^a-z0-9]+", "", nombre.lower()).strip("-")


async def exportar(canal, categoria: str, nombre: str) -> dict:
    """Baja el historial completo de un canal a <transcripts>/<categoria>/<nombre>/<nombre>.txt."""
    mensajes = []
    async for msg in canal.history(limit=None, oldest_first=True):
        if msg.author.bot:
            continue
        await descargar_adjuntos(msg, categoria, nombre)
        mensajes.append(mensaje_a_dict(msg))
        if len(mensajes) % 200 == 0:
            log.info("  %s mensajes…", len(mensajes))
    carpeta = TRANSCRIPTS_BASE / categoria / nombre
    carpeta.mkdir(parents=True, exist_ok=True)
    ruta = carpeta / f"{nombre}.txt"
    with open(ruta, "w", encoding="utf-8") as f:
        _write_header(f, canal.name, categoria, len(mensajes))
        f.write("".join(_format_mensaje(m) for m in mensajes))
    imagenes = len(list((carpeta / "adjuntos").glob("*"))) if (carpeta / "adjuntos").exists() else 0
    desde = mensajes[0]["timestamp"].strftime("%d/%m/%Y") if mensajes else "-"
    hasta = mensajes[-1]["timestamp"].strftime("%d/%m/%Y") if mensajes else "-"
    log.info("Listo: #%s → %s mensajes (%s a %s), %s imágenes → %s", canal.name, len(mensajes), desde, hasta, imagenes, ruta)
    return {"canal": canal.name, "id": canal.id, "mensajes": len(mensajes), "imagenes": imagenes, "desde": desde, "hasta": hasta}


def _numero(nombre_categoria: str) -> str:
    """ "❌ Canales inactivos 5" → "5"; sin número → "1"."""
    n = re.findall(r"\d+", nombre_categoria)
    return n[-1] if n else "1"


async def exportar_categorias(guild) -> None:
    texto = _simple(buscada_categoria).replace("-", " ")
    categorias = [c for c in guild.categories if texto in re.sub(r"[^a-z0-9 ]", "", c.name.lower())]
    if not categorias:
        log.error("Ninguna categoría contiene %r. Hay: %s", buscada_categoria, ", ".join(c.name for c in guild.categories))
        return
    registrar_en_directorio(
        roles={str(r.id): r.name for r in guild.roles},
        canales={str(c.id): c.name for c in guild.text_channels},
    )
    resumen = []
    for cat in sorted(categorias, key=lambda c: int(_numero(c.name))):
        numero = _numero(cat.name)
        log.info("== %s (%s canales)", cat.name, len(cat.text_channels))
        canales = []
        for canal in cat.text_channels:
            try:
                canales.append(await exportar(canal, f"inactivos/{numero}", _simple(canal.name) or str(canal.id)))
            except discord.Forbidden:
                log.error("Sin permiso para leer #%s", canal.name)
        resumen.append({"categoria": cat.name, "numero": numero, "canales": canales})
    destino = TRANSCRIPTS_BASE / "inactivos" / "resumen.json"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(len(r["canales"]) for r in resumen)
    log.info("Listo: %s categorías, %s canales, %s mensajes → %s", len(resumen), total,
             sum(c["mensajes"] for r in resumen for c in r["canales"]), destino)


@client.event
async def on_ready() -> None:
    try:
        guild = client.get_guild(GUILD_ID)
        if guild is None:
            log.error("Guild no encontrado")
            return
        if buscada_categoria:
            await exportar_categorias(guild)
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
        registrar_en_directorio(
            roles={str(r.id): r.name for r in guild.roles},
            canales={str(c.id): c.name for c in guild.text_channels},
        )
        canal = candidatos[0]
        await exportar(canal, CATEGORIA, _simple(canal.name) or str(canal.id))
    except discord.Forbidden:
        log.error("El bot no tiene permiso para leer ese canal")
    finally:
        await client.close()


if __name__ == "__main__":
    if not buscado and not buscado_id and not buscada_categoria:
        print(__doc__)
        sys.exit(1)
    client.run(TOKEN, log_handler=None)
