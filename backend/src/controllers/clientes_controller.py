from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from starlette.responses import FileResponse

from src.deps import get_current_user
from src.schemas import (
    ClienteCreate,
    ClientePatch,
    ClienteResponse,
    ClienteListItem,
    CobranzaItem,
    CuotaCreate,
    CuotaPatch,
    CuotaResponse,
    ObservacionCreate,
    ObservacionResponse,
    ProximosPasosCreate,
    ProximosPasosPatch,
    ProximosPasosResponse,
    MiroBoardCreate,
    MiroBoardPatch,
    MiroBoardResponse,
    FathomBoardCreate,
    FathomBoardPatch,
    FathomBoardResponse,
    DiscordTranscriptResponse,
    DiscordTranscriptPatch,
    DocumentoLinkCreate,
    DocumentoLinkPatch,
    DocumentoLinkResponse,
    OrdenListado,
)
from src.services.clientes_services import ClientesServices

router = APIRouter()
service = ClientesServices()


@router.post("", response_model=ClienteListItem, status_code=201)
def crear_cliente(body: ClienteCreate, _: str = Depends(get_current_user)):
    try:
        return service.crear_cliente(body)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al crear el cliente.")


@router.get("", response_model=list[ClienteListItem])
def listar_clientes(
    estado: str | None = Query(default=None),
    plan: str | None = Query(default=None),
    q: str | None = Query(default=None),
    orden: OrdenListado = Query(default="venc_asc"),
    _: str = Depends(get_current_user),
):
    try:
        return service.listar_clientes(estado=estado, plan=plan, q=q, orden=orden)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al listar clientes.")


@router.get("/cobranza", response_model=list[CobranzaItem])
def listar_cobranza(_: str = Depends(get_current_user)):
    try:
        return service.listar_cobranza()
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al listar cobranza.")


@router.get("/{cliente_id}", response_model=ClienteResponse)
def obtener_cliente(cliente_id: int, _: str = Depends(get_current_user)):
    try:
        cliente = service.obtener_cliente(cliente_id)
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return cliente
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al obtener el cliente.")


@router.patch("/{cliente_id}", response_model=ClienteListItem)
def actualizar_cliente(
    cliente_id: int,
    patch: ClientePatch,
    _: str = Depends(get_current_user),
):
    try:
        cliente = service.actualizar_cliente(cliente_id, patch)
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return cliente
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al actualizar el cliente.")


@router.delete("/{cliente_id}", status_code=204)
def eliminar_cliente(cliente_id: int, _: str = Depends(get_current_user)):
    try:
        deleted = service.eliminar_cliente(cliente_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return None
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al eliminar el cliente.")


@router.post("/{cliente_id}/observaciones", response_model=ObservacionResponse, status_code=201)
def crear_observacion(
    cliente_id: int,
    body: ObservacionCreate,
    _: str = Depends(get_current_user),
):
    try:
        observacion = service.crear_observacion(cliente_id, body)
        if not observacion:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return observacion
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al crear la observación.")


@router.delete("/{cliente_id}/observaciones/{observacion_id}", status_code=204)
def eliminar_observacion(
    cliente_id: int,
    observacion_id: int,
    _: str = Depends(get_current_user),
):
    try:
        deleted = service.eliminar_observacion(cliente_id, observacion_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cliente o observación no encontrados.")
        return None
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al eliminar la observación.")


@router.get("/{cliente_id}/proximos-pasos", response_model=list[ProximosPasosResponse])
def listar_proximos_pasos(
    cliente_id: int,
    _: str = Depends(get_current_user),
):
    try:
        pasos = service.listar_proximos_pasos(cliente_id)
        if pasos is None:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return pasos
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al listar próximos pasos.")


@router.post("/{cliente_id}/proximos-pasos", response_model=ProximosPasosResponse, status_code=201)
def crear_proximos_pasos(
    cliente_id: int,
    body: ProximosPasosCreate,
    _: str = Depends(get_current_user),
):
    try:
        paso = service.crear_proximos_pasos(cliente_id, body)
        if not paso:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return paso
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al crear próximos pasos.")


@router.patch("/{cliente_id}/proximos-pasos/{paso_id}", response_model=ProximosPasosResponse)
def actualizar_proximos_pasos(
    cliente_id: int,
    paso_id: int,
    body: ProximosPasosPatch,
    _: str = Depends(get_current_user),
):
    try:
        paso = service.actualizar_proximos_pasos(cliente_id, paso_id, body)
        if not paso:
            raise HTTPException(status_code=404, detail="Cliente o próximos pasos no encontrados.")
        return paso
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al actualizar próximos pasos.")


@router.delete("/{cliente_id}/proximos-pasos/{paso_id}", status_code=204)
def eliminar_proximos_pasos(
    cliente_id: int,
    paso_id: int,
    _: str = Depends(get_current_user),
):
    try:
        deleted = service.eliminar_proximos_pasos(cliente_id, paso_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cliente o próximos pasos no encontrados.")
        return None
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al eliminar próximos pasos.")


@router.post("/{cliente_id}/miros", response_model=MiroBoardResponse, status_code=201)
def crear_miro_board(
    cliente_id: int,
    body: MiroBoardCreate,
    _: str = Depends(get_current_user),
):
    try:
        board = service.crear_miro_board(cliente_id, body)
        if not board:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return board
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al crear el board de Miro.")


@router.patch("/{cliente_id}/miros/{miro_id}", response_model=MiroBoardResponse)
def actualizar_miro_board(
    cliente_id: int,
    miro_id: int,
    patch: MiroBoardPatch,
    _: str = Depends(get_current_user),
):
    try:
        board = service.actualizar_miro_board(cliente_id, miro_id, patch)
        if not board:
            raise HTTPException(status_code=404, detail="Cliente o board de Miro no encontrados.")
        return board
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al actualizar el board de Miro.")


@router.delete("/{cliente_id}/miros/{miro_id}", status_code=204)
def eliminar_miro_board(
    cliente_id: int,
    miro_id: int,
    _: str = Depends(get_current_user),
):
    try:
        deleted = service.eliminar_miro_board(cliente_id, miro_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cliente o board de Miro no encontrados.")
        return None
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al eliminar el board de Miro.")


@router.post("/{cliente_id}/fathoms", response_model=FathomBoardResponse, status_code=201)
def crear_fathom_board(
    cliente_id: int,
    body: FathomBoardCreate,
    _: str = Depends(get_current_user),
):
    try:
        board = service.crear_fathom_board(cliente_id, body)
        if not board:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return board
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al crear la grabación de Fathom.")


@router.patch("/{cliente_id}/fathoms/{fathom_id}", response_model=FathomBoardResponse)
def actualizar_fathom_board(
    cliente_id: int,
    fathom_id: int,
    patch: FathomBoardPatch,
    _: str = Depends(get_current_user),
):
    try:
        board = service.actualizar_fathom_board(cliente_id, fathom_id, patch)
        if not board:
            raise HTTPException(status_code=404, detail="Cliente o grabación de Fathom no encontrados.")
        return board
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al actualizar la grabación de Fathom.")


@router.delete("/{cliente_id}/fathoms/{fathom_id}", status_code=204)
def eliminar_fathom_board(
    cliente_id: int,
    fathom_id: int,
    _: str = Depends(get_current_user),
):
    try:
        deleted = service.eliminar_fathom_board(cliente_id, fathom_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cliente o grabación de Fathom no encontrados.")
        return None
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al eliminar la grabación de Fathom.")


@router.post("/{cliente_id}/discord-transcripts", response_model=DiscordTranscriptResponse, status_code=201)
async def crear_discord_transcript(
    cliente_id: int,
    file: UploadFile = File(...),
    titulo: str = Form(""),
    _: str = Depends(get_current_user),
):
    try:
        transcript = await service.crear_discord_transcript(cliente_id, file, titulo or None)
        if not transcript:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return transcript
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al subir el transcript de Discord.")


@router.patch("/{cliente_id}/discord-transcripts/{transcript_id}", response_model=DiscordTranscriptResponse)
def actualizar_discord_transcript(
    cliente_id: int,
    transcript_id: int,
    patch: DiscordTranscriptPatch,
    _: str = Depends(get_current_user),
):
    try:
        if patch.canal is None:
            raise HTTPException(status_code=400, detail="No se enviaron campos para actualizar.")
        transcript = service.actualizar_discord_transcript(cliente_id, transcript_id, patch.canal)
        if not transcript:
            raise HTTPException(status_code=404, detail="Cliente o transcript no encontrados.")
        return transcript
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al actualizar el transcript de Discord.")


@router.get("/{cliente_id}/discord-transcripts/{transcript_id}/download")
def descargar_discord_transcript(
    cliente_id: int,
    transcript_id: int,
    _: str = Depends(get_current_user),
):
    try:
        result = service.obtener_discord_transcript_archivo(cliente_id, transcript_id)
        if not result:
            raise HTTPException(status_code=404, detail="Cliente, transcript o archivo no encontrados.")
        file_path, nombre_archivo = result
        return FileResponse(file_path, media_type="text/plain", filename=nombre_archivo)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al descargar el transcript de Discord.")


@router.delete("/{cliente_id}/discord-transcripts/{transcript_id}", status_code=204)
def eliminar_discord_transcript(
    cliente_id: int,
    transcript_id: int,
    _: str = Depends(get_current_user),
):
    try:
        deleted = service.eliminar_discord_transcript(cliente_id, transcript_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cliente o transcript no encontrados.")
        return None
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al eliminar el transcript de Discord.")


@router.post("/{cliente_id}/documentos", response_model=DocumentoLinkResponse, status_code=201)
def crear_documento_link(
    cliente_id: int,
    body: DocumentoLinkCreate,
    _: str = Depends(get_current_user),
):
    try:
        link = service.crear_documento_link(cliente_id, body)
        if not link:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return link
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al crear el link de documento.")


@router.patch("/{cliente_id}/documentos/{link_id}", response_model=DocumentoLinkResponse)
def actualizar_documento_link(
    cliente_id: int,
    link_id: int,
    patch: DocumentoLinkPatch,
    _: str = Depends(get_current_user),
):
    try:
        link = service.actualizar_documento_link(cliente_id, link_id, patch)
        if not link:
            raise HTTPException(status_code=404, detail="Cliente o link de documento no encontrados.")
        return link
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al actualizar el link de documento.")


@router.delete("/{cliente_id}/documentos/{link_id}", status_code=204)
def eliminar_documento_link(
    cliente_id: int,
    link_id: int,
    _: str = Depends(get_current_user),
):
    try:
        deleted = service.eliminar_documento_link(cliente_id, link_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cliente o link de documento no encontrados.")
        return None
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al eliminar el link de documento.")


@router.post("/{cliente_id}/cuotas", response_model=CuotaResponse, status_code=201)
def crear_cuota(
    cliente_id: int,
    body: CuotaCreate,
    _: str = Depends(get_current_user),
):
    try:
        cuota = service.crear_cuota(cliente_id, body)
        if not cuota:
            raise HTTPException(status_code=404, detail="Cliente no encontrado.")
        return cuota
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al crear la cuota.")


@router.patch("/{cliente_id}/cuotas/{cuota_id}", response_model=CuotaResponse)
def actualizar_cuota(
    cliente_id: int,
    cuota_id: int,
    patch: CuotaPatch,
    _: str = Depends(get_current_user),
):
    try:
        cuota = service.actualizar_cuota(cliente_id, cuota_id, patch)
        if not cuota:
            raise HTTPException(status_code=404, detail="Cliente o cuota no encontrados.")
        return cuota
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al actualizar la cuota.")


@router.delete("/{cliente_id}/cuotas/{cuota_id}", status_code=204)
def eliminar_cuota(
    cliente_id: int,
    cuota_id: int,
    _: str = Depends(get_current_user),
):
    try:
        deleted = service.eliminar_cuota(cliente_id, cuota_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Cliente o cuota no encontrados.")
        return None
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al eliminar la cuota.")


@router.post("/{cliente_id}/cuotas/{cuota_id}/pagar", response_model=CuotaResponse)
def pagar_cuota(
    cliente_id: int,
    cuota_id: int,
    _: str = Depends(get_current_user),
):
    try:
        cuota = service.marcar_cuota_pagada(cliente_id, cuota_id)
        if not cuota:
            raise HTTPException(status_code=404, detail="Cliente o cuota no encontrados.")
        return cuota
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=500, detail="Error al marcar la cuota como pagada.")
