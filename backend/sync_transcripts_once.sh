#!/usr/bin/env bash
# One-shot: sync de transcripts Discord → backend/transcripts
# Uso:  ./sync_transcripts_once.sh
set -euo pipefail
cd "$(dirname "$0")"

python3 - <<'PY'
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

_BACKEND_ROOT = Path.cwd()
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

import discord
from decouple import config

from src.db import init_db
from src.services.discord_service import detectar_categoria, sync_canal

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("sync_once")

TOKEN = config("DISCORD_BOT_TOKEN", default="")
GUILD_ID = int(config("DISCORD_GUILD_ID", default="0"))


async def main() -> int:
    if not TOKEN or not GUILD_ID:
        log.error("Falta DISCORD_BOT_TOKEN o DISCORD_GUILD_ID en .env")
        return 1

    init_db()

    intents = discord.Intents.default()
    intents.message_content = True
    intents.guilds = True
    client = discord.Client(intents=intents)
    done = asyncio.Event()
    result = {"ok": False, "procesados": 0, "msgs": 0}

    @client.event
    async def on_ready() -> None:
        try:
            guild = client.get_guild(GUILD_ID)
            if not guild:
                log.error("Guild %s no encontrado", GUILD_ID)
                return
            log.info("Conectado como %s · guild %s", client.user, guild.name)
            procesados = 0
            msgs = 0
            for category in guild.categories:
                slug = detectar_categoria(category.name)
                if not slug:
                    continue
                for canal in category.text_channels:
                    r = await sync_canal(canal, slug)
                    procesados += 1
                    msgs += int(r.get("mensajes") or 0)
                    await asyncio.sleep(0.35)
            canal_updates = next(
                (c for c in guild.text_channels if "updates" in c.name.lower()),
                None,
            )
            if canal_updates:
                r = await sync_canal(canal_updates, "updates")
                procesados += 1
                msgs += int(r.get("mensajes") or 0)
            result.update(ok=True, procesados=procesados, msgs=msgs)
            log.info("Listo · %s canales · %s mensajes nuevos", procesados, msgs)
        finally:
            await client.close()
            done.set()

    try:
        await client.start(TOKEN)
    except Exception:
        log.exception("Falló el sync")
        return 1
    await done.wait()
    return 0 if result["ok"] else 2


sys.exit(asyncio.run(main()))
PY
