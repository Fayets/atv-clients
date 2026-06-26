from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from pony.orm import db_session, desc
from src.deps import get_current_user
from src.models import DiscordTranscript

router = APIRouter()


def _get_transcripts_by_cliente(cliente_id: int) -> list:
    """Obtiene transcripts de un cliente sin usar generators."""
    all_transcripts = DiscordTranscript.select()[:]
    return [t for t in all_transcripts if t.cliente is not None and t.cliente.id == cliente_id]


@router.get("/sin-match")
@db_session
def canales_sin_match(_: str = Depends(get_current_user)):
    all_transcripts = DiscordTranscript.select()[:]
    sin_match = [t for t in all_transcripts if t.cliente is None]
    sin_match.sort(key=lambda t: t.fecha, reverse=True)
    return [
        {"canal": t.canal, "categoria": t.categoria, "fecha": t.fecha.isoformat()}
        for t in sin_match[:50]
    ]


@router.get("/{cliente_id}/estado")
@db_session
def get_estado(cliente_id: int, _: str = Depends(get_current_user)):
    from src.discord_bot import _canal_activo
    transcripts = _get_transcripts_by_cliente(cliente_id)
    transcripts.sort(key=lambda t: t.creado_en or datetime.min, reverse=True)
    ultimo = transcripts[0] if transcripts else None
    canal_cliente = transcripts[0].canal if transcripts else None
    actualizando = bool(canal_cliente and _canal_activo == canal_cliente)
    return {
        "actualizando": actualizando,
        "ultima_actualizacion": ultimo.creado_en.isoformat() if ultimo and ultimo.creado_en else None,
    }


@router.get("/{cliente_id}/transcripts")
@db_session
def listar_transcripts(cliente_id: int, _: str = Depends(get_current_user)):
    transcripts = _get_transcripts_by_cliente(cliente_id)
    transcripts.sort(key=lambda t: t.fecha, reverse=True)
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


@router.post("/{cliente_id}/actualizar")
@db_session
def actualizar_transcript(cliente_id: int, _: str = Depends(get_current_user)):
    import asyncio
    from src.models import Cliente
    from src.discord_bot import trigger_cliente

    cliente = Cliente.get(id=cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")

    transcripts = _get_transcripts_by_cliente(cliente_id)
    transcripts.sort(key=lambda t: t.creado_en or datetime.min, reverse=True)

    if not transcripts:
        raise HTTPException(status_code=404, detail="No hay canal de Discord asociado a este cliente")

    transcript = transcripts[0]
    asyncio.get_event_loop().create_task(
        trigger_cliente(transcript.canal, transcript.categoria)
    )
    return {"status": "iniciado", "canal": transcript.canal}
