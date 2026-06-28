from fastapi import APIRouter, Depends, HTTPException, Query

from src.deps import get_agent_auth
from src.schemas import (
    AgentDiscordTranscriptContenido,
    AgentDiscordTranscriptItem,
)
from src.services.agent_services import AgentServices

router = APIRouter()
service = AgentServices()


@router.get("/clientes")
def buscar_clientes(
    q: str | None = Query(default=None),
    id: int | None = Query(default=None),
    _: None = Depends(get_agent_auth),
):
    try:
        result = service.buscar_clientes(q, id)
        if result is None:
            raise HTTPException(status_code=404, detail="No se encontró cliente.")
        return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error al buscar clientes.")


@router.get(
    "/clientes/{cliente_id}/discord-transcripts",
    response_model=list[AgentDiscordTranscriptItem],
)
def listar_discord_transcripts(
    cliente_id: int,
    _: None = Depends(get_agent_auth),
):
    try:
        transcripts = service.listar_discord_transcripts(cliente_id)
        if transcripts is None:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return transcripts
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error al listar transcripts de Discord.")


@router.get(
    "/clientes/{cliente_id}/discord-transcripts/{transcript_id}",
    response_model=AgentDiscordTranscriptContenido,
)
def obtener_discord_transcript(
    cliente_id: int,
    transcript_id: int,
    _: None = Depends(get_agent_auth),
):
    try:
        transcript = service.obtener_discord_transcript(cliente_id, transcript_id)
        if not transcript:
            raise HTTPException(status_code=404, detail="Transcript no encontrado.")
        return transcript
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="Error al obtener el transcript de Discord.")
