from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pony.orm import db_session, desc, select

from src.deps import get_current_user
from src.models import DiscordTranscript

router = APIRouter()


@router.get("/sin-match")
@db_session
def canales_sin_match(_: str = Depends(get_current_user)):
    """Canales que no matchearon con ningún cliente. Útil para debugging."""
    sin_match = select(
        t for t in DiscordTranscript if t.cliente is None
    ).order_by(lambda t: desc(t.fecha))[:50]
    return [
        {"canal": t.canal, "categoria": t.categoria, "fecha": t.fecha.isoformat()}
        for t in sin_match
    ]


@router.get("/{cliente_id}/transcripts")
@db_session
def listar_transcripts(cliente_id: int, _: str = Depends(get_current_user)):
    transcripts = select(
        t for t in DiscordTranscript if t.cliente is not None and t.cliente.id == cliente_id
    ).order_by(lambda t: desc(t.fecha))[:]
    return [
        {
            "id": t.id,
            "canal": t.canal,
            "categoria": t.categoria,
            "fecha": t.fecha.isoformat(),
            "mensajes": t.mensajes,
        }
        for t in transcripts
    ]


@router.get("/{cliente_id}/transcripts/{transcript_id}")
@router.get("/{cliente_id}/transcripts/{transcript_id}/contenido")
@db_session
def ver_transcript(
    cliente_id: int,
    transcript_id: int,
    _: str = Depends(get_current_user),
):
    t = DiscordTranscript.get(id=transcript_id)
    if not t or (t.cliente and t.cliente.id != cliente_id):
        raise HTTPException(status_code=404, detail="Transcript no encontrado")
    p = Path(t.filepath)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return PlainTextResponse(p.read_text(encoding="utf-8"))


@router.get("/{cliente_id}/estado")
@db_session
def get_estado(cliente_id: int, _: str = Depends(get_current_user)):
    from src.discord_bot import _bot_running

    ultimo = select(
        t for t in DiscordTranscript
        if t.cliente is not None and t.cliente.id == cliente_id
    ).order_by(lambda t: desc(t.creado_en)).first()

    return {
        "actualizando": _bot_running,
        "ultima_actualizacion": ultimo.creado_en.isoformat() if ultimo and ultimo.creado_en else None,
    }


@router.post("/{cliente_id}/actualizar")
@db_session
def actualizar_transcript(cliente_id: int, _: str = Depends(get_current_user)):
    import asyncio

    from src.discord_bot import trigger_cliente
    from src.models import Cliente

    cliente = Cliente.get(id=cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    transcript = select(
        t for t in DiscordTranscript
        if t.cliente is not None and t.cliente.id == cliente_id
    ).order_by(lambda t: desc(t.creado_en)).first()

    if not transcript:
        raise HTTPException(status_code=404, detail="No hay canal de Discord asociado a este cliente")

    asyncio.get_event_loop().create_task(trigger_cliente(transcript.canal, transcript.categoria))

    return {"status": "iniciado", "canal": transcript.canal}
