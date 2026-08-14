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
    "inactivo",
]

EstadoEfectivo = Literal[
    "vigente",
    "proximo_a_vencer",
    "vencido",
    "pausa",
    "no_va_a_renovar",
    "llamada_recompra",
    "estan_bien",
    "inactivo",
]

PlanActual = Literal["mentoria", "boost", "advantage"]
Oportunidad = Literal["upsell_boost", "upsell_advantage", "recompra", "consultar"]
PrioridadCobro = Literal["alta", "media", "baja"]
Responsable = Literal["lucas", "juampi", "juan", "ale"]
EstadoCuota = Literal["pendiente", "pagado", "vencido"]
CuotaNotaTipo = Literal["cuota", "recompra", "upsell"]
OrdenListado = Literal["venc_asc", "venc_desc"]


class CuotaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    monto_usd: Decimal
    fecha_vence: date
    fecha_pago: date | None = None
    estado: EstadoCuota
    tipo: CuotaNotaTipo
    notas: str | None = None
    nota_label: str | None = None
    tiene_comprobante: bool = False
    comprobante_nombre: str | None = None
    created_at: datetime | None = None


class AgentCobrosCuotaItem(BaseModel):
    cliente_id: int
    cliente_nombre: str
    monto_usd: float
    fecha_vence: date
    mes_vencimiento: str
    es_arrastre: bool
    estado: EstadoCuota
    tipo: CuotaNotaTipo


class AgentCobrosResponse(BaseModel):
    mes: str
    total_pendiente_usd: float
    cantidad: int
    cuotas: list[AgentCobrosCuotaItem] = Field(default_factory=list)


class AgentCobrosDetalleGrupo(BaseModel):
    total_usd: float
    cantidad: int
    detalle: list[AgentCobrosCuotaItem] = Field(default_factory=list)


class AgentCobrosArrastreResponse(BaseModel):
    mes: str
    cuotas: AgentCobrosDetalleGrupo
    recompras_upsells: AgentCobrosDetalleGrupo
    total_general_usd: float


class AgentProyeccionCuotaItem(BaseModel):
    cliente_id: int
    cliente_nombre: str
    monto_usd: float
    fecha_vence: date
    estado: EstadoCuota


class AgentProyeccionGrupo(BaseModel):
    cantidad: int
    monto_usd: float
    cuotas: list[AgentProyeccionCuotaItem] = Field(default_factory=list)


class AgentProyeccionesResponse(BaseModel):
    mes: str
    total_proyectado_usd: float
    recompras: AgentProyeccionGrupo
    upsells: AgentProyeccionGrupo


class AgentCuotaBuscarItem(BaseModel):
    cuota_id: int
    cliente_nombre: str
    monto_usd: float
    fecha_vence: date
    estado: EstadoCuota
    tipo: CuotaNotaTipo


class AgentCuotaBuscarResponse(BaseModel):
    cuotas: list[AgentCuotaBuscarItem] = Field(default_factory=list)


class AgentCuotaIdRequest(BaseModel):
    cuota_id: int = Field(gt=0)


class AgentCuotaAccionResponse(BaseModel):
    cuota_id: int
    cliente_nombre: str
    monto_usd: float
    estado: EstadoCuota
    fecha_pago: date | None = None
    mensaje: str | None = None


class CuotaCreate(BaseModel):
    monto_usd: Decimal
    fecha_vence: date
    notas: str | None = None
    fecha_inicio: date | None = None
    duracion_meses: int | None = Field(default=None, ge=1, le=12)


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
    tipo: CuotaNotaTipo | None = None


class FormRespuesta(BaseModel):
    pregunta: str
    respuesta: str


class ClienteListItem(BaseModel):
    id: int
    nombre: str
    email: str
    plan_actual: PlanActual
    fecha_inicio: date | None = None
    fecha_vencimiento: date | None = None
    estado_cliente: EstadoCliente
    estado_efectivo: EstadoEfectivo
    dias_restantes: int | None = None
    oportunidad: Oportunidad | None = None
    responsable: Responsable | None = None
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


class DashboardDetalleItem(BaseModel):
    cliente_id: int
    nombre: str
    plan_actual: PlanActual
    monto_usd: Decimal
    subtitulo: str | None = None
    estado_efectivo: EstadoEfectivo | None = None


class DashboardMesCobranza(BaseModel):
    mes: str
    cobrado_usd: Decimal
    pendiente_usd: Decimal
    total_usd: Decimal


class DashboardEstadoCount(BaseModel):
    estado: str
    label: str
    count: int


class DashboardPlanAdeudo(BaseModel):
    plan: PlanActual
    monto_usd: Decimal
    clientes: int


class DashboardGraficos(BaseModel):
    cobranza_mensual: list[DashboardMesCobranza] = Field(default_factory=list)
    estados_clientes: list[DashboardEstadoCount] = Field(default_factory=list)
    adeudo_por_plan: list[DashboardPlanAdeudo] = Field(default_factory=list)


class DashboardProyeccionItem(BaseModel):
    cliente_id: int
    nombre: str
    plan_actual: PlanActual
    monto_usd: Decimal
    subtitulo: str | None = None
    responsable: Responsable | None = None


class DashboardResumen(BaseModel):
    mes_label: str
    mes: int
    anio: int
    cuotas_a_cobrar_usd: Decimal
    proyeccion_usd: Decimal
    caja_1_usd: Decimal | None = None
    caja_2_usd: Decimal
    total_mes_usd: Decimal


class DashboardDetalles(BaseModel):
    cuotas: list[DashboardDetalleItem] = Field(default_factory=list)
    proyeccion: list[DashboardProyeccionItem] = Field(default_factory=list)


class DashboardResponse(BaseModel):
    resumen: DashboardResumen
    detalles: DashboardDetalles = Field(default_factory=DashboardDetalles)


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
    email: EmailStr | None = None
    estado_cliente: EstadoCliente | None = None
    plan_actual: PlanActual | None = None
    oportunidad: Oportunidad | None = None
    responsable: Responsable | None = None
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


class AnalisisCashResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    total_usd: Decimal
    periodo: str
    titulo: str
    subtitulo: str
    historia: str
    fuentes: str
    updated_at: datetime | None = None
    updated_by: str | None = None


class AnalisisCashPatch(BaseModel):
    total_usd: Decimal | None = None
    periodo: str | None = Field(default=None, max_length=120)
    titulo: str | None = Field(default=None, max_length=255)
    subtitulo: str | None = Field(default=None, max_length=255)
    historia: str | None = None
    fuentes: str | None = None


class AnalisisIAItem(BaseModel):
    id: str
    cliente_id: int | None = None
    cliente_nombre: str
    plan: PlanActual
    categoria: str | None = None
    tipo: str | None = None
    urgencia: Literal["alta", "media", "baja"] | None = None
    status_crm: str | None = None
    programa: PlanActual | None = None
    monto_usd: float | int | None = None
    confianza: int | None = None
    evidencia: str | None = None
    accion: str | None = None
    titulo: str | None = None
    señal: str | None = None
    tendencia: str | None = None
    frase_cliente: str | None = None
    logros: list[str] = Field(default_factory=list)
    accion_reunion: str | None = None
    resumen: str | None = None
    analizado_at: datetime | None = None


class AnalisisIAResponse(BaseModel):
    ultimo_analisis_en: datetime | None = None
    proximo_analisis_en: datetime | None = None
    intervalo_dias: int = 2
    en_ejecucion: bool = False
    origen: str | None = None
    total_analizados: int = 0
    requieren_accion: int = 0
    clientes_analizados: list[AnalisisIAItem] = Field(default_factory=list)
    resultados: list[AnalisisIAItem] = Field(default_factory=list)
    error: str | None = None
