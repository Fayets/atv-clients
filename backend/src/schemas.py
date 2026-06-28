from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

EstadoCliente = Literal[
    "vigente",
    "proximo_a_vencer",
    "vencido",
    "pausa",
    "no_va_a_renovar",
    "llamada_recompra",
    "estan_bien",
]

EstadoEfectivo = Literal[
    "vigente",
    "proximo_a_vencer",
    "vencido",
    "pausa",
    "no_va_a_renovar",
    "llamada_recompra",
    "estan_bien",
]

PlanActual = Literal["mentoria", "boost", "advantage"]
Oportunidad = Literal["upsell_boost", "upsell_advantage", "recompra", "consultar"]
PrioridadCobro = Literal["alta", "media", "baja"]
EstadoCuota = Literal["pendiente", "pagado", "vencido"]
OrdenListado = Literal["venc_asc", "venc_desc"]


class CuotaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    monto_usd: Decimal
    fecha_vence: date
    fecha_pago: date | None = None
    estado: EstadoCuota
    notas: str | None = None
    created_at: datetime | None = None


class CuotaCreate(BaseModel):
    monto_usd: Decimal
    fecha_vence: date
    notas: str | None = None


class CuotaPatch(BaseModel):
    monto_usd: Decimal | None = None
    fecha_vence: date | None = None
    notas: str | None = None
    estado: EstadoCuota | None = None
    fecha_pago: date | None = None


class ObservacionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    autor: str
    texto: str
    created_at: datetime | None = None


class ObservacionCreate(BaseModel):
    autor: str = Field(min_length=1, max_length=255)
    texto: str = Field(min_length=1)


class ProximosPasosResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    fecha_llamada: date
    mentor: str
    contenido: str
    link: str | None = None
    created_at: datetime | None = None


class ProximosPasosCreate(BaseModel):
    fecha_llamada: date
    mentor: str = Field(min_length=1, max_length=100)
    contenido: str = ""
    link: str | None = None

    @field_validator("link")
    @classmethod
    def normalize_link(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        return trimmed or None

    @model_validator(mode="after")
    def require_contenido_or_link(self) -> "ProximosPasosCreate":
        if not self.contenido.strip() and not self.link:
            raise ValueError("Completá próximos pasos o el link de Google Docs.")
        return self


class ProximosPasosPatch(ProximosPasosCreate):
    pass


class MiroBoardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    titulo: str
    url: str
    created_at: datetime | None = None


class MiroBoardCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1)


class MiroBoardPatch(BaseModel):
    titulo: str | None = Field(default=None, min_length=1, max_length=255)
    url: str | None = Field(default=None, min_length=1)


class FathomBoardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    titulo: str
    url: str
    created_at: datetime | None = None


class FathomBoardCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1)


class FathomBoardPatch(BaseModel):
    titulo: str | None = Field(default=None, min_length=1, max_length=255)
    url: str | None = Field(default=None, min_length=1)


class DiscordTranscriptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int | None = None
    canal: str
    categoria: str
    fecha: date
    filepath: str
    mensajes: int = 0
    creado_en: datetime | None = None


class DiscordTranscriptPatch(BaseModel):
    canal: str | None = Field(default=None, min_length=1, max_length=100)


class AgentDiscordTranscriptItem(BaseModel):
    id: int
    canal: str
    categoria: str
    fecha: date
    mensajes: int = 0


class AgentDiscordTranscriptResponse(BaseModel):
    id: int
    cliente_id: int | None = None
    canal: str
    categoria: str
    fecha: date
    mensajes: int = 0
    creado_en: datetime | None = None


class AgentDiscordTranscriptContenido(BaseModel):
    id: int
    canal: str
    fecha: date
    mensajes: int = 0
    contenido: str


class AgentClienteResumen(BaseModel):
    id: int
    nombre: str
    plan_actual: PlanActual
    estado_efectivo: EstadoEfectivo


class DocumentoLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    titulo: str
    url: str
    created_at: datetime | None = None


class DocumentoLinkCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    url: str = Field(min_length=1)


class DocumentoLinkPatch(BaseModel):
    titulo: str | None = Field(default=None, min_length=1, max_length=255)
    url: str | None = Field(default=None, min_length=1)


class ProximaCuotaResponse(BaseModel):
    id: int
    monto_usd: Decimal
    fecha_vence: date
    estado: EstadoCuota


class FormRespuesta(BaseModel):
    pregunta: str
    respuesta: str


class ClienteListItem(BaseModel):
    id: int
    nombre: str
    email: str
    plan_actual: PlanActual
    fecha_vencimiento: date | None = None
    estado_cliente: EstadoCliente
    estado_efectivo: EstadoEfectivo
    dias_restantes: int | None = None
    oportunidad: Oportunidad | None = None
    prioridad_cobro: PrioridadCobro | None = None
    total_pagado_usd: Decimal
    total_adeudado_usd: Decimal
    miro_url: str | None = None
    fathom_last_call: date | None = None
    fathom_last_call_url: str | None = None
    miros: list[MiroBoardResponse] = Field(default_factory=list)
    ultimo_proximos_pasos: ProximosPasosResponse | None = None


class CobranzaItem(ClienteListItem):
    proxima_cuota: ProximaCuotaResponse | None = None


class ClienteResponse(ClienteListItem):
    session_id: int | None = None
    fecha_inicio: date | None = None
    duracion_dias: int | None = None
    fathoms_url: str | None = None
    arreglo_closer: str | None = None
    miros: list[MiroBoardResponse] = Field(default_factory=list)
    fathoms: list[FathomBoardResponse] = Field(default_factory=list)
    discord_transcripts: list[DiscordTranscriptResponse] = Field(default_factory=list)
    documento_links: list[DocumentoLinkResponse] = Field(default_factory=list)
    observaciones: list[ObservacionResponse] = Field(default_factory=list)
    proximos_pasos: list[ProximosPasosResponse] = Field(default_factory=list)
    fecha_alta: datetime | None = None
    fecha_baja: datetime | None = None
    updated_at: datetime | None = None
    cuotas: list[CuotaResponse] = Field(default_factory=list)
    formulario_onboarding: list[FormRespuesta] = Field(default_factory=list)


class AgentClienteResponse(ClienteListItem):
    session_id: int | None = None
    fecha_inicio: date | None = None
    duracion_dias: int | None = None
    fathoms_url: str | None = None
    arreglo_closer: str | None = None
    miros: list[MiroBoardResponse] = Field(default_factory=list)
    fathoms: list[FathomBoardResponse] = Field(default_factory=list)
    discord_transcripts: list[AgentDiscordTranscriptResponse] = Field(default_factory=list)
    documento_links: list[DocumentoLinkResponse] = Field(default_factory=list)
    observaciones: list[ObservacionResponse] = Field(default_factory=list)
    proximos_pasos: list[ProximosPasosResponse] = Field(default_factory=list)
    fecha_alta: datetime | None = None
    fecha_baja: datetime | None = None
    updated_at: datetime | None = None
    cuotas: list[CuotaResponse] = Field(default_factory=list)
    formulario_onboarding: list[FormRespuesta] = Field(default_factory=list)


class ClienteCreate(BaseModel):
    nombre: str = Field(min_length=1, max_length=255)
    email: EmailStr
    plan_actual: PlanActual
    session_id: int | None = None
    fecha_inicio: date | None = None
    duracion_dias: int | None = None
    fecha_vencimiento: date | None = None
    estado_cliente: EstadoCliente = "vigente"
    total_pagado_usd: Decimal = Decimal("0")
    total_adeudado_usd: Decimal = Decimal("0")
    observaciones: str | None = None


class ClientePatch(BaseModel):
    estado_cliente: EstadoCliente | None = None
    plan_actual: PlanActual | None = None
    oportunidad: Oportunidad | None = None
    prioridad_cobro: PrioridadCobro | None = None
    miro_url: str | None = None
    fathoms_url: str | None = None
    arreglo_closer: str | None = None
    observaciones: str | None = None
    total_pagado_usd: Decimal | None = None
    total_adeudado_usd: Decimal | None = None
    fecha_inicio: date | None = None
    fecha_vencimiento: date | None = None
    duracion_dias: int | None = None
