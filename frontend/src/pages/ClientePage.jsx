import { useEffect, useRef, useState } from 'react'
import { fetchCliente, createCuota, createDocumentoLink, createFathomBoard, createMiroBoard, createObservacion, createProximosPasos, deleteCliente, deleteCuota, deleteCuotaComprobante, deleteDiscordTranscript, deleteDocumentoLink, deleteFathomBoard, deleteMiroBoard, deleteObservacion, deleteProximosPasos, discordTranscriptDownloadUrl, fetchDiscordEstado, fetchDiscordTranscriptContenido, fetchDiscordTranscriptsBot, patchCliente, patchCuota, patchDiscordTranscript, patchDocumentoLink, patchFathomBoard, patchMiroBoard, patchProximosPasos, triggerDiscordActualizacion, uploadCuotaComprobante, uploadDiscordTranscript, cuotaComprobanteUrl } from '../api/clientes'
import { navigate } from '../utils/navigation'
import { getSession } from '../api/auth'
import InlineField from '../components/InlineField'
import Navbar from '../components/Navbar'
import PlanBadge from '../components/PlanBadge'
import StatusBadge from '../components/StatusBadge'
import { ESTADOS_CLIENTE, MESES_DURACION, OPORTUNIDADES, PLANES_CLIENTE, PRIORIDADES, RESPONSABLES, TIPOS_CUOTA_NOTA, canonicalTipoCuota, labelTipoCuotaNota } from '../constants/options'
import {
  calcFechaVencimiento,
  formatDate,
  formatDateTime,
  formatDuracionMeses,
  formatOportunidad,
  formatPrioridad,
  formatResponsable,
  formatUsd,
  isValidDateISO,
  monthsToDays,
  daysToMonths,
  MESES_POR_PLAN,
} from '../utils/format'
import styles from './ClientePage.module.css'

const CUOTA_FECHA_INVALIDA = 'La fecha no es válida. Revisá día y mes (ej. septiembre tiene 30 días).'
const COMPROBANTE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif'

function validateCuotaFields(monto, fechaVence, dateInput) {
  if (!monto || Number.isNaN(Number(monto)) || Number(monto) <= 0) {
    return 'Completá un monto válido.'
  }
  if (dateInput?.validity?.badInput || (fechaVence && !isValidDateISO(fechaVence))) {
    return CUOTA_FECHA_INVALIDA
  }
  if (!fechaVence || !isValidDateISO(fechaVence)) {
    return CUOTA_FECHA_INVALIDA
  }
  return null
}

function handleCuotaFechaChange(setter, event, setError, field = 'fecha_vence') {
  const { value, validity } = event.target
  setter((prev) => ({ ...prev, [field]: value }))
  if (validity.badInput || (value && !isValidDateISO(value))) {
    setError(CUOTA_FECHA_INVALIDA)
  } else {
    setError('')
  }
}

function handleCuotaRowKeyDown(event, onSave, onCancel) {
  if (event.nativeEvent.isComposing) return
  if (event.target.closest('button')) return
  if (event.key === 'Enter') {
    event.preventDefault()
    onSave()
  }
  if (event.key === 'Escape' && onCancel) {
    event.preventDefault()
    onCancel()
  }
}

const MENTORES = ['Juampi', 'Juan Cruz', 'Lucas', 'Nick', 'Maite', 'Emi', 'Lucho', 'Franco', 'Alejandro', 'Otro']

function todayInputDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const TIPOS_RENOVACION = new Set(['cuota_recompra', 'cuota_upsell'])

function defaultDuracionMeses(cliente) {
  const actual = daysToMonths(cliente?.duracion_dias)
  if (actual) return String(actual)
  const porPlan = MESES_POR_PLAN[cliente?.plan_actual]
  return porPlan ? String(porPlan) : '4'
}

function emptyNewCuota(cliente) {
  return {
    monto_usd: '',
    fecha_vence: '',
    notas: 'cuota_venta',
    fecha_inicio: todayInputDate(),
    duracion_meses: defaultDuracionMeses(cliente),
    renovarPrograma: null,
  }
}

function buildProximosPasosDraft() {
  return {
    fecha_llamada: todayInputDate(),
    mentor: '',
    mentorOtro: '',
    link: '',
    contenido: '',
  }
}

function sortProximosPasos(list) {
  return [...list].sort((a, b) => {
    const byDate = b.fecha_llamada.localeCompare(a.fecha_llamada)
    if (byDate !== 0) return byDate
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })
}

function resolveProximosPasosMentor(draft) {
  return draft.mentor === 'Otro' ? draft.mentorOtro.trim() : draft.mentor.trim()
}

function validateProximosPasosDraft(draft) {
  if (
    !draft.fecha_llamada
    || !resolveProximosPasosMentor(draft)
    || (!draft.contenido.trim() && !draft.link.trim())
  ) {
    return 'Completá fecha, mentor, y próximos pasos o link de Google Docs.'
  }
  return null
}

function buildProximosPasosPayload(draft) {
  return {
    fecha_llamada: draft.fecha_llamada,
    mentor: resolveProximosPasosMentor(draft),
    contenido: draft.contenido.trim(),
    link: draft.link.trim() || null,
  }
}

function pasoToEditDraft(paso) {
  const mentorInList = MENTORES.includes(paso.mentor)
  return {
    fecha_llamada: paso.fecha_llamada,
    mentor: mentorInList ? paso.mentor : 'Otro',
    mentorOtro: mentorInList ? '' : paso.mentor,
    link: paso.link || '',
    contenido: paso.contenido === '—' ? '' : (paso.contenido || ''),
  }
}

function ProximosPasosFormFields({ draft, setDraft, autoFocus = false, expanded = false }) {
  return (
    <>
      <div>
        <span className={styles.label}>Fecha de llamada</span>
        <input
          type="date"
          className={styles.tableInput}
          value={draft.fecha_llamada}
          onChange={(event) => setDraft((prev) => ({ ...prev, fecha_llamada: event.target.value }))}
          autoFocus={autoFocus}
        />
      </div>
      <div>
        <span className={styles.label}>Mentor</span>
        <select
          className={styles.tableInput}
          value={draft.mentor}
          onChange={(event) => setDraft((prev) => ({
            ...prev,
            mentor: event.target.value,
            mentorOtro: event.target.value === 'Otro' ? prev.mentorOtro : '',
          }))}
        >
          <option value="">Seleccionar mentor</option>
          {MENTORES.map((mentor) => (
            <option key={mentor} value={mentor}>{mentor}</option>
          ))}
        </select>
      </div>
      {draft.mentor === 'Otro' ? (
        <div>
          <span className={styles.label}>Nombre del mentor</span>
          <input
            type="text"
            className={styles.tableInput}
            value={draft.mentorOtro}
            onChange={(event) => setDraft((prev) => ({ ...prev, mentorOtro: event.target.value }))}
            placeholder="Escribí el nombre"
          />
        </div>
      ) : null}
      <div>
        <span className={styles.label}>Link de Google Docs</span>
        <input
          type="url"
          className={styles.tableInput}
          value={draft.link}
          onChange={(event) => setDraft((prev) => ({ ...prev, link: event.target.value }))}
          placeholder="https://docs.google.com/document/d/..."
        />
      </div>
      <div>
        <span className={styles.label}>Próximos pasos</span>
        <textarea
          className={expanded ? styles.proximosPasosTextarea : styles.arregloCloserTextarea}
          rows={expanded ? 10 : 4}
          value={draft.contenido}
          onChange={(event) => setDraft((prev) => ({ ...prev, contenido: event.target.value }))}
          placeholder="Qué acordaron hacer después de la llamada... (opcional si pegás el link)"
        />
      </div>
    </>
  )
}

function buildBoardTitulo(clienteNombre, encargado) {
  const name = clienteNombre.trim().toUpperCase()
  const owner = encargado.trim().toUpperCase()
  return `${name} - ${owner}`
}

function extractEncargadoFromTitulo(titulo, clienteNombre) {
  if (!titulo || titulo === 'Board principal') return ''
  const normalized = titulo.trim()
  const prefix = `${clienteNombre.trim()} - `
  if (normalized.toUpperCase().startsWith(prefix.toUpperCase())) {
    return normalized.slice(prefix.length).trim()
  }
  const sep = normalized.indexOf(' - ')
  if (sep >= 0) return normalized.slice(sep + 3).trim()
  return normalized
}

export default function ClientePage({ clienteId }) {
  const [cliente, setCliente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [addingCuota, setAddingCuota] = useState(false)
  const [newCuota, setNewCuota] = useState(() => emptyNewCuota())
  const [editingCuotaId, setEditingCuotaId] = useState(null)
  const [editCuota, setEditCuota] = useState({ monto_usd: '', fecha_vence: '', fecha_pago: '', notas: '' })
  const [cuotaError, setCuotaError] = useState('')
  const [comprobanteView, setComprobanteView] = useState(null)
  const [comprobanteNonce, setComprobanteNonce] = useState(0)
  const [comprobanteSaving, setComprobanteSaving] = useState(false)
  const [comprobanteImgError, setComprobanteImgError] = useState(false)
  const comprobanteInputRef = useRef(null)
  const comprobanteTargetIdRef = useRef(null)
  const [arregloCloserOpen, setArregloCloserOpen] = useState(false)
  const [arregloCloserDraft, setArregloCloserDraft] = useState('')
  const [arregloCloserSaving, setArregloCloserSaving] = useState(false)
  const [observacionOpen, setObservacionOpen] = useState(false)
  const [observacionDraft, setObservacionDraft] = useState({ autor: '', texto: '' })
  const [observacionSaving, setObservacionSaving] = useState(false)
  const [observacionError, setObservacionError] = useState('')
  const [sessionUser, setSessionUser] = useState(null)
  const [miroOpen, setMiroOpen] = useState(false)
  const [miroDraft, setMiroDraft] = useState({ encargado: '', url: '' })
  const [miroSaving, setMiroSaving] = useState(false)
  const [miroError, setMiroError] = useState('')
  const [editingMiroId, setEditingMiroId] = useState(null)
  const [miroEditDraft, setMiroEditDraft] = useState({ encargado: '', url: '' })
  const [fathomOpen, setFathomOpen] = useState(false)
  const [fathomDraft, setFathomDraft] = useState({ encargado: '', url: '' })
  const [fathomSaving, setFathomSaving] = useState(false)
  const [fathomError, setFathomError] = useState('')
  const [editingFathomId, setEditingFathomId] = useState(null)
  const [fathomEditDraft, setFathomEditDraft] = useState({ encargado: '', url: '' })
  const [discordOpen, setDiscordOpen] = useState(false)
  const [discordDraft, setDiscordDraft] = useState({ titulo: '', file: null })
  const [discordSaving, setDiscordSaving] = useState(false)
  const [discordUpdating, setDiscordUpdating] = useState(false)
  const [discordError, setDiscordError] = useState('')
  const [editingDiscordId, setEditingDiscordId] = useState(null)
  const [discordEditDraft, setDiscordEditDraft] = useState({ titulo: '' })
  const [botTranscripts, setBotTranscripts] = useState([])
  const [botTranscriptsLoading, setBotTranscriptsLoading] = useState(false)
  const [selectedBotTranscript, setSelectedBotTranscript] = useState(null)
  const [botTranscriptContenido, setBotTranscriptContenido] = useState('')
  const [botTranscriptLoading, setBotTranscriptLoading] = useState(false)
  const [discordEstado, setDiscordEstado] = useState({ actualizando: false, ultima_actualizacion: null })
  const [discordActualizando, setDiscordActualizando] = useState(false)
  const [proximaActualizacion, setProximaActualizacion] = useState(null)
  const [countdownDisplay, setCountdownDisplay] = useState('')
  const [discordEstadoLabel, setDiscordEstadoLabel] = useState('ok')
  const [deletingCliente, setDeletingCliente] = useState(false)
  const [documentoOpen, setDocumentoOpen] = useState(false)
  const [documentoDraft, setDocumentoDraft] = useState({ titulo: '', url: '' })
  const [documentoSaving, setDocumentoSaving] = useState(false)
  const [documentoError, setDocumentoError] = useState('')
  const [editingDocumentoId, setEditingDocumentoId] = useState(null)
  const [documentoEditDraft, setDocumentoEditDraft] = useState({ titulo: '', url: '' })
  const [proximosPasosOpen, setProximosPasosOpen] = useState(false)
  const [proximosPasosDraft, setProximosPasosDraft] = useState(buildProximosPasosDraft())
  const [proximosPasosSaving, setProximosPasosSaving] = useState(false)
  const [proximosPasosError, setProximosPasosError] = useState('')
  const [editingProximosPasosId, setEditingProximosPasosId] = useState(null)
  const [proximosPasosEditDraft, setProximosPasosEditDraft] = useState(buildProximosPasosDraft())

  const loadBotTranscripts = async () => {
    setBotTranscriptsLoading(true)
    try {
      const data = await fetchDiscordTranscriptsBot(clienteId)
      setBotTranscripts(data.filter((t) => t.categoria !== 'manual'))
    } catch (err) {
      console.error('Error cargando transcripts del bot:', err)
    } finally {
      setBotTranscriptsLoading(false)
    }
  }

  const verBotTranscript = async (transcript) => {
    setSelectedBotTranscript(transcript)
    setBotTranscriptContenido('')
    setBotTranscriptLoading(true)
    try {
      const texto = await fetchDiscordTranscriptContenido(clienteId, transcript.id)
      setBotTranscriptContenido(texto)
    } catch (err) {
      setBotTranscriptContenido('Error al cargar el transcript.')
    } finally {
      setBotTranscriptLoading(false)
    }
  }

  const cerrarBotTranscript = () => {
    setSelectedBotTranscript(null)
    setBotTranscriptContenido('')
  }

  const loadDiscordEstado = async () => {
    try {
      const data = await fetchDiscordEstado(clienteId)
      setDiscordEstado(data)
    } catch (err) {
      console.error('Error cargando estado Discord:', err)
    }
  }

  const handleActualizarTranscript = async () => {
    setDiscordEstadoLabel('actualizando')
    setDiscordActualizando(true)
    try {
      await triggerDiscordActualizacion(clienteId)
      const poll = setInterval(async () => {
        const estado = await fetchDiscordEstado(clienteId)
        setDiscordEstado(estado)
        if (!estado.actualizando) {
          clearInterval(poll)
          setDiscordActualizando(false)
          setDiscordEstadoLabel('ok')
          await loadBotTranscripts()
        }
      }, 3000)
    } catch (err) {
      setDiscordActualizando(false)
      setDiscordEstadoLabel('error')
    }
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await fetchCliente(clienteId)
      setCliente(data)
    } catch (err) {
      setCliente(null)
      setError(err.message || 'No se pudo cargar el cliente')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    loadBotTranscripts()
    loadDiscordEstado()
  }, [clienteId])

  useEffect(() => {
    getSession().then((session) => setSessionUser(session))
  }, [])

  useEffect(() => {
    const HORARIOS = [
      [9, 0], [10, 0], [13, 0], [16, 0], [18, 45], [23, 59],
    ]

    const getProximoHorario = () => {
      const ahora = new Date()
      const ahoraAR = new Date(ahora.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
      const hAR = ahoraAR.getHours()
      const mAR = ahoraAR.getMinutes()
      const totalMinAhora = hAR * 60 + mAR

      for (const [h, m] of HORARIOS) {
        const totalMin = h * 60 + m
        if (totalMin > totalMinAhora) {
          const proxima = new Date(ahora)
          proxima.setHours(proxima.getHours() + (h - hAR))
          proxima.setMinutes(proxima.getMinutes() + (m - mAR))
          proxima.setSeconds(0)
          return proxima
        }
      }
      const proxima = new Date(ahora)
      proxima.setDate(proxima.getDate() + 1)
      proxima.setHours(proxima.getHours() + (9 - hAR))
      proxima.setMinutes(proxima.getMinutes() + (0 - mAR))
      proxima.setSeconds(0)
      return proxima
    }

    const tick = () => {
      const proxima = getProximoHorario()
      const diff = proxima - new Date()
      if (diff <= 0) {
        setCountdownDisplay('00:00:00')
        return
      }
      const hh = String(Math.floor(diff / 3600000)).padStart(2, '0')
      const mm = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0')
      const ss = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0')
      setCountdownDisplay(`${hh}:${mm}:${ss}`)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])

  const updateField = async (field, value) => {
    const updated = await patchCliente(clienteId, { [field]: value })
    const reloadFields = [
      'estado_cliente',
      'plan_actual',
      'fecha_inicio',
      'duracion_dias',
      'fecha_vencimiento',
    ]
    if (reloadFields.includes(field)) {
      await load()
      return
    }
    setCliente((prev) => ({ ...prev, ...updated, [field]: value }))
  }

  const eliminarCliente = async () => {
    if (!cliente) return
    if (!confirm(`¿Eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`)) return
    setDeletingCliente(true)
    try {
      await deleteCliente(clienteId)
      navigate('/clientes')
    } catch (err) {
      alert(err.message || 'No se pudo eliminar el cliente.')
    } finally {
      setDeletingCliente(false)
    }
  }

  const refreshFinanciero = async () => {
    const data = await fetchCliente(clienteId)
    setCliente((prev) => ({
      ...prev,
      cuotas: data.cuotas,
      total_pagado_usd: data.total_pagado_usd,
      total_adeudado_usd: data.total_adeudado_usd,
    }))
    return data
  }

  const resetNewCuota = () => {
    setAddingCuota(false)
    setNewCuota(emptyNewCuota(cliente))
    setCuotaError('')
  }

  const resetEditCuota = () => {
    setEditingCuotaId(null)
    setEditCuota({ monto_usd: '', fecha_vence: '', fecha_pago: '', notas: '' })
    setCuotaError('')
  }

  const startEditCuota = (cuota) => {
    setAddingCuota(false)
    setCuotaError('')
    setEditingCuotaId(cuota.id)
    setEditCuota({
      monto_usd: String(cuota.monto_usd),
      fecha_vence: cuota.fecha_vence || '',
      fecha_pago: (cuota.fecha_pago || '').slice(0, 10),
      notas: canonicalTipoCuota(cuota.notas),
    })
  }

  const guardarNuevaCuota = async () => {
    setCuotaError('')
    const validationError = validateCuotaFields(newCuota.monto_usd, newCuota.fecha_vence)
    if (validationError) {
      setCuotaError(validationError)
      return
    }
    const esRenovacion = TIPOS_RENOVACION.has(newCuota.notas)
    if (esRenovacion && newCuota.renovarPrograma == null) {
      setCuotaError('Indicá si querés establecer un nuevo período de vencimiento.')
      return
    }
    if (esRenovacion && newCuota.renovarPrograma) {
      if (!newCuota.fecha_inicio || !isValidDateISO(newCuota.fecha_inicio)) {
        setCuotaError('Indicá la nueva fecha de inicio del programa.')
        return
      }
      if (!newCuota.duracion_meses) {
        setCuotaError('Indicá la duración en meses del upsell o recompra.')
        return
      }
    }
    try {
      const payload = {
        monto_usd: Number(newCuota.monto_usd),
        fecha_vence: newCuota.fecha_vence,
        notas: newCuota.notas.trim() || 'cuota_venta',
      }
      if (esRenovacion && newCuota.renovarPrograma) {
        payload.fecha_inicio = newCuota.fecha_inicio
        payload.duracion_meses = Number(newCuota.duracion_meses)
      }
      await createCuota(clienteId, payload)
      resetNewCuota()
      await load()
    } catch (err) {
      setCuotaError(err.message || 'No se pudo crear la cuota.')
    }
  }

  const guardarEditCuota = async (cuotaId) => {
    setCuotaError('')
    const validationError = validateCuotaFields(editCuota.monto_usd, editCuota.fecha_vence)
    if (validationError) {
      setCuotaError(validationError)
      return
    }
    if (editCuota.fecha_pago && !isValidDateISO(editCuota.fecha_pago)) {
      setCuotaError(CUOTA_FECHA_INVALIDA)
      return
    }
    const fechaPago = editCuota.fecha_pago || null
    const cuotaActual = cliente?.cuotas?.find((c) => c.id === cuotaId)
    const payload = {
      monto_usd: Number(editCuota.monto_usd),
      fecha_vence: editCuota.fecha_vence,
      notas: editCuota.notas.trim() || 'cuota_venta',
      fecha_pago: fechaPago,
    }
    if (fechaPago) {
      payload.estado = 'pagado'
    } else if (cuotaActual?.estado === 'pagado') {
      payload.estado = 'pendiente'
    }
    try {
      await patchCuota(clienteId, cuotaId, payload)
      resetEditCuota()
      await refreshFinanciero()
    } catch (err) {
      setCuotaError(err.message || 'No se pudo actualizar la cuota.')
    }
  }

  const marcarPagado = async (cuotaId) => {
    setCuotaError('')
    try {
      await patchCuota(clienteId, cuotaId, { estado: 'pagado' })
      await refreshFinanciero()
    } catch (err) {
      setCuotaError(err.message || 'No se pudo marcar la cuota como pagada.')
    }
  }

  const eliminarCuota = async (cuotaId) => {
    if (!confirm('¿Eliminar esta cuota?')) return
    setCuotaError('')
    try {
      await deleteCuota(clienteId, cuotaId)
      if (editingCuotaId === cuotaId) resetEditCuota()
      await refreshFinanciero()
    } catch (err) {
      setCuotaError(err.message || 'No se pudo eliminar la cuota.')
    }
  }

  const abrirSelectorComprobante = (cuotaId) => {
    comprobanteTargetIdRef.current = cuotaId
    comprobanteInputRef.current?.click()
  }

  const abrirComprobantes = (cuota) => {
    setComprobanteImgError(false)
    setComprobanteView({ cuotaId: cuota.id, index: 0 })
  }

  const onComprobanteSeleccionado = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    const cuotaId = comprobanteTargetIdRef.current
    comprobanteTargetIdRef.current = null
    if (!files.length || !cuotaId) return
    setCuotaError('')
    setComprobanteSaving(true)
    try {
      for (const file of files) {
        const formData = new FormData()
        formData.append('file', file)
        await uploadCuotaComprobante(clienteId, cuotaId, formData)
      }
      setComprobanteNonce((n) => n + 1)
      const data = await refreshFinanciero()
      const actualizada = data.cuotas?.find((c) => c.id === cuotaId)
      const total = actualizada?.comprobantes?.length || 0
      if (total) {
        setComprobanteImgError(false)
        setComprobanteView({ cuotaId, index: total - 1 })
      }
    } catch (err) {
      setCuotaError(err.message || 'No se pudo subir el comprobante.')
    } finally {
      setComprobanteSaving(false)
    }
  }

  const eliminarComprobante = async (cuotaId, comprobanteId) => {
    if (!confirm('¿Eliminar este comprobante?')) return
    setCuotaError('')
    setComprobanteSaving(true)
    try {
      await deleteCuotaComprobante(clienteId, cuotaId, comprobanteId)
      const data = await refreshFinanciero()
      const actualizada = data.cuotas?.find((c) => c.id === cuotaId)
      const restantes = actualizada?.comprobantes || []
      if (!restantes.length) {
        setComprobanteView(null)
      } else {
        setComprobanteView((prev) => ({
          cuotaId,
          index: Math.min(prev?.index || 0, restantes.length - 1),
        }))
      }
    } catch (err) {
      setCuotaError(err.message || 'No se pudo eliminar el comprobante.')
    } finally {
      setComprobanteSaving(false)
    }
  }

  const renderComprobanteCell = (cuota) => {
    const cantidad = cuota.comprobantes?.length || 0
    return (
      <td data-label="Comprobante" className={styles.cuotaFiles}>
        <div className={styles.cuotaActions}>
          {cantidad ? (
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnHasFile} ${styles.comprobanteBadgeBtn}`}
              aria-label={`Ver comprobantes (${cantidad})`}
              title={cantidad === 1 ? 'Ver comprobante' : `Ver ${cantidad} comprobantes`}
              onClick={() => abrirComprobantes(cuota)}
            >
              <i className="ti ti-photo" />
              {cantidad > 1 ? <span className={styles.comprobanteCount}>{cantidad}</span> : null}
            </button>
          ) : null}
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Agregar comprobante"
            title="Agregar comprobante"
            onClick={() => abrirSelectorComprobante(cuota.id)}
            disabled={comprobanteSaving}
          >
            <i className="ti ti-paperclip" />
          </button>
        </div>
      </td>
    )
  }

  const openArregloCloser = () => {
    setArregloCloserDraft(cliente?.arreglo_closer || '')
    setArregloCloserOpen(true)
  }

  const closeArregloCloser = () => {
    setArregloCloserOpen(false)
    setArregloCloserDraft('')
  }

  const guardarArregloCloser = async () => {
    setCuotaError('')
    setArregloCloserSaving(true)
    try {
      await updateField('arreglo_closer', arregloCloserDraft.trim() || null)
      closeArregloCloser()
    } catch (err) {
      setCuotaError(err.message || 'No se pudo guardar el arreglo closer.')
    } finally {
      setArregloCloserSaving(false)
    }
  }

  const refreshObservaciones = async () => {
    const data = await fetchCliente(clienteId)
    setCliente((prev) => ({
      ...prev,
      observaciones: data.observaciones,
    }))
  }

  const openObservacion = () => {
    setObservacionError('')
    setObservacionDraft({
      autor: sessionUser?.nombre || sessionUser?.email || '',
      texto: '',
    })
    setObservacionOpen(true)
  }

  const closeObservacion = () => {
    setObservacionOpen(false)
    setObservacionDraft({ autor: '', texto: '' })
    setObservacionError('')
  }

  const guardarObservacion = async () => {
    setObservacionError('')
    if (!observacionDraft.autor.trim() || !observacionDraft.texto.trim()) {
      setObservacionError('Completá quién hizo la observación y el texto.')
      return
    }
    setObservacionSaving(true)
    try {
      await createObservacion(clienteId, {
        autor: observacionDraft.autor.trim(),
        texto: observacionDraft.texto.trim(),
      })
      closeObservacion()
      await refreshObservaciones()
    } catch (err) {
      setObservacionError(err.message || 'No se pudo guardar la observación.')
    } finally {
      setObservacionSaving(false)
    }
  }

  const eliminarObservacion = async (observacionId) => {
    if (!confirm('¿Eliminar esta observación?')) return
    setObservacionError('')
    try {
      await deleteObservacion(clienteId, observacionId)
      await refreshObservaciones()
    } catch (err) {
      setObservacionError(err.message || 'No se pudo eliminar la observación.')
    }
  }

  const openProximosPasos = () => {
    setProximosPasosError('')
    setEditingProximosPasosId(null)
    setProximosPasosDraft(buildProximosPasosDraft())
    setProximosPasosOpen(true)
  }

  const closeProximosPasos = () => {
    setProximosPasosOpen(false)
    setProximosPasosDraft(buildProximosPasosDraft())
    setProximosPasosError('')
  }

  const startEditProximosPasos = (paso) => {
    setProximosPasosOpen(false)
    setProximosPasosError('')
    setEditingProximosPasosId(paso.id)
    setProximosPasosEditDraft(pasoToEditDraft(paso))
  }

  const cancelEditProximosPasos = () => {
    setEditingProximosPasosId(null)
    setProximosPasosEditDraft(buildProximosPasosDraft())
    setProximosPasosError('')
  }

  const guardarProximosPasos = async () => {
    setProximosPasosError('')
    const validationError = validateProximosPasosDraft(proximosPasosDraft)
    if (validationError) {
      setProximosPasosError(validationError)
      return
    }

    setProximosPasosSaving(true)
    try {
      const created = await createProximosPasos(clienteId, buildProximosPasosPayload(proximosPasosDraft))
      setCliente((prev) => ({
        ...prev,
        proximos_pasos: sortProximosPasos([...(prev.proximos_pasos || []), created]),
      }))
      closeProximosPasos()
    } catch (err) {
      setProximosPasosError(err.message || 'No se pudieron guardar los próximos pasos.')
    } finally {
      setProximosPasosSaving(false)
    }
  }

  const guardarEditProximosPasos = async (pasoId) => {
    setProximosPasosError('')
    const validationError = validateProximosPasosDraft(proximosPasosEditDraft)
    if (validationError) {
      setProximosPasosError(validationError)
      return
    }

    setProximosPasosSaving(true)
    try {
      const updated = await patchProximosPasos(clienteId, pasoId, buildProximosPasosPayload(proximosPasosEditDraft))
      setCliente((prev) => ({
        ...prev,
        proximos_pasos: sortProximosPasos(
          (prev.proximos_pasos || []).map((paso) => (paso.id === pasoId ? updated : paso)),
        ),
      }))
      cancelEditProximosPasos()
    } catch (err) {
      setProximosPasosError(err.message || 'No se pudieron actualizar los próximos pasos.')
    } finally {
      setProximosPasosSaving(false)
    }
  }

  const eliminarProximosPasos = async (pasoId) => {
    if (!confirm('¿Eliminar estos próximos pasos?')) return
    setProximosPasosError('')
    try {
      await deleteProximosPasos(clienteId, pasoId)
      if (editingProximosPasosId === pasoId) setEditingProximosPasosId(null)
      setCliente((prev) => ({
        ...prev,
        proximos_pasos: (prev.proximos_pasos || []).filter((paso) => paso.id !== pasoId),
      }))
    } catch (err) {
      setProximosPasosError(err.message || 'No se pudieron eliminar los próximos pasos.')
    }
  }

  const refreshMiros = async () => {
    const data = await fetchCliente(clienteId)
    setCliente((prev) => ({
      ...prev,
      miros: data.miros,
      miro_url: data.miro_url,
    }))
  }

  const openMiroForm = () => {
    setMiroError('')
    setMiroDraft({ encargado: '', url: '' })
    setMiroOpen(true)
  }

  const closeMiroForm = () => {
    setMiroOpen(false)
    setMiroDraft({ encargado: '', url: '' })
    setMiroError('')
  }

  const guardarMiro = async () => {
    setMiroError('')
    if (!miroDraft.encargado.trim() || !miroDraft.url.trim()) {
      setMiroError('Completá encargado y URL del board.')
      return
    }
    setMiroSaving(true)
    try {
      await createMiroBoard(clienteId, {
        titulo: buildBoardTitulo(cliente.nombre, miroDraft.encargado),
        url: miroDraft.url.trim(),
      })
      closeMiroForm()
      await refreshMiros()
    } catch (err) {
      setMiroError(err.message || 'No se pudo guardar el board de Miro.')
    } finally {
      setMiroSaving(false)
    }
  }

  const eliminarMiro = async (miroId) => {
    if (!confirm('¿Eliminar este board de Miro?')) return
    setMiroError('')
    try {
      await deleteMiroBoard(clienteId, miroId)
      if (editingMiroId === miroId) setEditingMiroId(null)
      await refreshMiros()
    } catch (err) {
      setMiroError(err.message || 'No se pudo eliminar el board de Miro.')
    }
  }

  const startEditMiro = (board) => {
    setMiroOpen(false)
    setEditingMiroId(board.id)
    setMiroEditDraft({
      encargado: extractEncargadoFromTitulo(board.titulo, cliente.nombre),
      url: board.url,
    })
    setMiroError('')
  }

  const cancelEditMiro = () => {
    setEditingMiroId(null)
    setMiroEditDraft({ encargado: '', url: '' })
    setMiroError('')
  }

  const guardarEditMiro = async (miroId) => {
    setMiroError('')
    if (!miroEditDraft.encargado.trim() || !miroEditDraft.url.trim()) {
      setMiroError('Completá encargado y URL del board.')
      return
    }
    setMiroSaving(true)
    try {
      await patchMiroBoard(clienteId, miroId, {
        titulo: buildBoardTitulo(cliente.nombre, miroEditDraft.encargado),
        url: miroEditDraft.url.trim(),
      })
      cancelEditMiro()
      await refreshMiros()
    } catch (err) {
      setMiroError(err.message || 'No se pudo actualizar el board de Miro.')
    } finally {
      setMiroSaving(false)
    }
  }

  const refreshFathoms = async () => {
    const data = await fetchCliente(clienteId)
    setCliente((prev) => ({
      ...prev,
      fathoms: data.fathoms,
      fathoms_url: data.fathoms_url,
    }))
  }

  const openFathomForm = () => {
    setFathomError('')
    setFathomDraft({ encargado: '', url: '' })
    setFathomOpen(true)
  }

  const closeFathomForm = () => {
    setFathomOpen(false)
    setFathomDraft({ encargado: '', url: '' })
    setFathomError('')
  }

  const guardarFathom = async () => {
    setFathomError('')
    if (!fathomDraft.encargado.trim() || !fathomDraft.url.trim()) {
      setFathomError('Completá encargado y URL de la grabación.')
      return
    }
    setFathomSaving(true)
    try {
      await createFathomBoard(clienteId, {
        titulo: buildBoardTitulo(cliente.nombre, fathomDraft.encargado),
        url: fathomDraft.url.trim(),
      })
      closeFathomForm()
      await refreshFathoms()
    } catch (err) {
      setFathomError(err.message || 'No se pudo guardar la grabación de Fathom.')
    } finally {
      setFathomSaving(false)
    }
  }

  const eliminarFathom = async (fathomId) => {
    if (!confirm('¿Eliminar esta grabación de Fathom?')) return
    setFathomError('')
    try {
      await deleteFathomBoard(clienteId, fathomId)
      if (editingFathomId === fathomId) setEditingFathomId(null)
      await refreshFathoms()
    } catch (err) {
      setFathomError(err.message || 'No se pudo eliminar la grabación de Fathom.')
    }
  }

  const startEditFathom = (board) => {
    setFathomOpen(false)
    setEditingFathomId(board.id)
    setFathomEditDraft({
      encargado: extractEncargadoFromTitulo(board.titulo, cliente.nombre),
      url: board.url,
    })
    setFathomError('')
  }

  const cancelEditFathom = () => {
    setEditingFathomId(null)
    setFathomEditDraft({ encargado: '', url: '' })
    setFathomError('')
  }

  const guardarEditFathom = async (fathomId) => {
    setFathomError('')
    if (!fathomEditDraft.encargado.trim() || !fathomEditDraft.url.trim()) {
      setFathomError('Completá encargado y URL de la grabación.')
      return
    }
    setFathomSaving(true)
    try {
      await patchFathomBoard(clienteId, fathomId, {
        titulo: buildBoardTitulo(cliente.nombre, fathomEditDraft.encargado),
        url: fathomEditDraft.url.trim(),
      })
      cancelEditFathom()
      await refreshFathoms()
    } catch (err) {
      setFathomError(err.message || 'No se pudo actualizar la grabación de Fathom.')
    } finally {
      setFathomSaving(false)
    }
  }

  const refreshDiscordTranscripts = async () => {
    const data = await fetchCliente(clienteId)
    setCliente((prev) => ({
      ...prev,
      discord_transcripts: data.discord_transcripts,
    }))
  }

  const openDiscordForm = () => {
    setDiscordError('')
    setDiscordDraft({ titulo: '', file: null })
    setDiscordOpen(true)
  }

  const closeDiscordForm = () => {
    setDiscordOpen(false)
    setDiscordDraft({ titulo: '', file: null })
    setDiscordError('')
  }

  const actualizarDiscordTxt = async () => {
    setDiscordError('')
    setDiscordUpdating(true)
    try {
      await Promise.resolve()
    } catch (err) {
      setDiscordError(err.message || 'No se pudo actualizar el transcript.')
    } finally {
      setDiscordUpdating(false)
    }
  }

  const guardarDiscord = async () => {
    setDiscordError('')
    if (!discordDraft.file) {
      setDiscordError('Seleccioná un archivo .txt.')
      return
    }
    setDiscordSaving(true)
    try {
      const formData = new FormData()
      formData.append('file', discordDraft.file)
      if (discordDraft.titulo.trim()) {
        formData.append('titulo', discordDraft.titulo.trim().toUpperCase())
      }
      await uploadDiscordTranscript(clienteId, formData)
      closeDiscordForm()
      await refreshDiscordTranscripts()
    } catch (err) {
      setDiscordError(err.message || 'No se pudo subir el transcript.')
    } finally {
      setDiscordSaving(false)
    }
  }

  const eliminarDiscord = async (transcriptId) => {
    if (!confirm('¿Eliminar este transcript?')) return
    setDiscordError('')
    try {
      await deleteDiscordTranscript(clienteId, transcriptId)
      if (editingDiscordId === transcriptId) setEditingDiscordId(null)
      await refreshDiscordTranscripts()
    } catch (err) {
      setDiscordError(err.message || 'No se pudo eliminar el transcript.')
    }
  }

  const startEditDiscord = (transcript) => {
    setDiscordOpen(false)
    setEditingDiscordId(transcript.id)
    setDiscordEditDraft({ titulo: transcript.titulo })
    setDiscordError('')
  }

  const cancelEditDiscord = () => {
    setEditingDiscordId(null)
    setDiscordEditDraft({ titulo: '' })
    setDiscordError('')
  }

  const guardarEditDiscord = async (transcriptId) => {
    setDiscordError('')
    if (!discordEditDraft.titulo.trim()) {
      setDiscordError('Completá el título del transcript.')
      return
    }
    setDiscordSaving(true)
    try {
      await patchDiscordTranscript(clienteId, transcriptId, {
        titulo: discordEditDraft.titulo.trim().toUpperCase(),
      })
      cancelEditDiscord()
      await refreshDiscordTranscripts()
    } catch (err) {
      setDiscordError(err.message || 'No se pudo actualizar el transcript.')
    } finally {
      setDiscordSaving(false)
    }
  }

  const refreshDocumentoLinks = async () => {
    const data = await fetchCliente(clienteId)
    setCliente((prev) => ({
      ...prev,
      documento_links: data.documento_links,
    }))
  }

  const openDocumentoForm = () => {
    setDocumentoError('')
    setDocumentoDraft({ titulo: '', url: '' })
    setDocumentoOpen(true)
  }

  const closeDocumentoForm = () => {
    setDocumentoOpen(false)
    setDocumentoDraft({ titulo: '', url: '' })
    setDocumentoError('')
  }

  const guardarDocumento = async () => {
    setDocumentoError('')
    if (!documentoDraft.titulo.trim() || !documentoDraft.url.trim()) {
      setDocumentoError('Completá título y URL del documento.')
      return
    }
    setDocumentoSaving(true)
    try {
      await createDocumentoLink(clienteId, {
        titulo: documentoDraft.titulo.trim().toUpperCase(),
        url: documentoDraft.url.trim(),
      })
      closeDocumentoForm()
      await refreshDocumentoLinks()
    } catch (err) {
      setDocumentoError(err.message || 'No se pudo guardar el link.')
    } finally {
      setDocumentoSaving(false)
    }
  }

  const eliminarDocumento = async (linkId) => {
    if (!confirm('¿Eliminar este link de documento?')) return
    setDocumentoError('')
    try {
      await deleteDocumentoLink(clienteId, linkId)
      if (editingDocumentoId === linkId) setEditingDocumentoId(null)
      await refreshDocumentoLinks()
    } catch (err) {
      setDocumentoError(err.message || 'No se pudo eliminar el link.')
    }
  }

  const startEditDocumento = (link) => {
    setDocumentoOpen(false)
    setEditingDocumentoId(link.id)
    setDocumentoEditDraft({
      titulo: link.titulo,
      url: link.url,
    })
    setDocumentoError('')
  }

  const cancelEditDocumento = () => {
    setEditingDocumentoId(null)
    setDocumentoEditDraft({ titulo: '', url: '' })
    setDocumentoError('')
  }

  const guardarEditDocumento = async (linkId) => {
    setDocumentoError('')
    if (!documentoEditDraft.titulo.trim() || !documentoEditDraft.url.trim()) {
      setDocumentoError('Completá título y URL del documento.')
      return
    }
    setDocumentoSaving(true)
    try {
      await patchDocumentoLink(clienteId, linkId, {
        titulo: documentoEditDraft.titulo.trim().toUpperCase(),
        url: documentoEditDraft.url.trim(),
      })
      cancelEditDocumento()
      await refreshDocumentoLinks()
    } catch (err) {
      setDocumentoError(err.message || 'No se pudo actualizar el link.')
    } finally {
      setDocumentoSaving(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <Navbar currentPath="" />
        <main className={styles.content}>
          <p className={styles.muted}>Cargando ficha...</p>
        </main>
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className={styles.page}>
        <Navbar currentPath="" />
        <main className={styles.content}>
          <p className={styles.error}>{error || 'Cliente no encontrado'}</p>
          <a
            href="/clientes"
            className={styles.backLink}
            onClick={(event) => {
              event.preventDefault()
              navigate('/clientes')
            }}
          >
            ← Volver al dashboard
          </a>
        </main>
      </div>
    )
  }

  const comprobanteCuota = comprobanteView
    ? cliente.cuotas?.find((c) => c.id === comprobanteView.cuotaId)
    : null
  const comprobantesVisibles = comprobanteCuota?.comprobantes || []
  const comprobanteIndex = comprobantesVisibles.length
    ? Math.min(Math.max(comprobanteView?.index || 0, 0), comprobantesVisibles.length - 1)
    : 0
  const comprobanteActual = comprobantesVisibles[comprobanteIndex] || null

  return (
    <div className={styles.page}>
      <Navbar currentPath="" />

      <main className={styles.content}>
        <a
          href="/clientes"
          className={styles.backLink}
          onClick={(event) => {
            event.preventDefault()
            navigate('/clientes')
          }}
        >
          ← Volver a clientes
        </a>

        <header className={styles.headerCard}>
          <div>
            <h1 className={styles.name}>{cliente.nombre}</h1>
            <InlineField
              type="email"
              className={styles.emailField}
              value={cliente.email || ''}
              placeholder="Sin email"
              onSave={(value) => updateField('email', value.trim())}
            />
          </div>
          <div className={styles.headerActions}>
            <PlanBadge plan={cliente.plan_actual} />
            <StatusBadge estado={cliente.estado_efectivo} />
            <button
              type="button"
              className={styles.deleteClienteBtn}
              onClick={eliminarCliente}
              disabled={deletingCliente}
              title="Eliminar cliente"
              aria-label="Eliminar cliente"
            >
              <i className="ti ti-trash" />
              <span className={styles.btnLabel}>{deletingCliente ? 'Eliminando...' : 'Eliminar'}</span>
            </button>
          </div>
        </header>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Programa</h2>
          <div className={styles.grid}>
            <div>
              <span className={styles.label}>Plan</span>
              <InlineField
                type="select"
                variant="chip"
                value={cliente.plan_actual}
                displayValue={<PlanBadge plan={cliente.plan_actual} />}
                options={PLANES_CLIENTE}
                onSave={(value) => updateField('plan_actual', value)}
              />
            </div>
            <div>
              <span className={styles.label}>Fecha inicio</span>
              <InlineField
                type="date"
                value={cliente.fecha_inicio || ''}
                displayValue={formatDate(cliente.fecha_inicio)}
                onSave={(value) => updateField('fecha_inicio', value || null)}
              />
            </div>
            <div>
              <span className={styles.label}>Duración (meses)</span>
              <InlineField
                type="select"
                value={daysToMonths(cliente.duracion_dias) ? String(daysToMonths(cliente.duracion_dias)) : ''}
                displayValue={formatDuracionMeses(cliente.duracion_dias)}
                options={MESES_DURACION}
                onSave={(value) => updateField('duracion_dias', value ? monthsToDays(value) : null)}
              />
            </div>
            <div>
              <span className={styles.label}>Fecha vencimiento</span>
              <InlineField
                type="date"
                value={cliente.fecha_vencimiento || ''}
                displayValue={formatDate(cliente.fecha_vencimiento)}
                onSave={(value) => updateField('fecha_vencimiento', value || null)}
              />
            </div>
            <div>
              <span className={styles.label}>Días restantes</span>
              <p className={styles.metricValue}>{cliente.dias_restantes ?? '—'}</p>
            </div>
          </div>
        </section>

        <div className={styles.quadGrid}>
          <section className={`${styles.quadTile} ${styles.brandTile}`}>
            <div className={`${styles.brandHeader} ${styles.brandHeaderMiro}`}>
              <img src="/logos/miro.png" alt="Miro" className={styles.brandLogoMiro} />
            </div>
            <div className={styles.linkTileBody}>
              <div className={styles.miroToolbar}>
                <span className={styles.label}>Boards</span>
                <button type="button" className={styles.arregloCloserBtn} onClick={openMiroForm}>
                  + Agregar Miro
                </button>
              </div>

              {miroOpen ? (
                <div className={styles.miroFormPanel}>
                  <div>
                    <span className={styles.label}>Título</span>
                    <div className={styles.boardTituloRow}>
                      <span className={styles.boardTituloPrefix}>{cliente.nombre} -</span>
                      <input
                        type="text"
                        className={`${styles.tableInput} ${styles.boardTituloInput}`}
                        value={miroDraft.encargado}
                        onChange={(event) => setMiroDraft((prev) => ({ ...prev, encargado: event.target.value.toUpperCase() }))}
                        placeholder="Encargado del board"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div>
                    <span className={styles.label}>URL del board</span>
                    <input
                      type="url"
                      className={styles.tableInput}
                      value={miroDraft.url}
                      onChange={(event) => setMiroDraft((prev) => ({ ...prev, url: event.target.value }))}
                      placeholder="https://miro.com/app/board/..."
                    />
                  </div>
                  {miroError ? <p className={styles.error}>{miroError}</p> : null}
                  <div className={styles.cuotaActions}>
                    <button type="button" className={styles.saveBtn} onClick={guardarMiro} disabled={miroSaving}>
                      {miroSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button type="button" className={styles.cancelBtn} onClick={closeMiroForm}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              {miroError && !miroOpen ? <p className={styles.error}>{miroError}</p> : null}

              <div className={styles.miroGrid}>
                {cliente.miros?.length ? cliente.miros.map((board) => (
                  editingMiroId === board.id ? (
                    <div key={board.id} className={`${styles.miroFormPanel} ${styles.miroFormPanelWide}`}>
                      <div>
                        <span className={styles.label}>Título</span>
                        <div className={styles.boardTituloRow}>
                          <span className={styles.boardTituloPrefix}>{cliente.nombre} -</span>
                          <input
                            type="text"
                            className={`${styles.tableInput} ${styles.boardTituloInput}`}
                            value={miroEditDraft.encargado}
                            onChange={(event) => setMiroEditDraft((prev) => ({ ...prev, encargado: event.target.value.toUpperCase() }))}
                            placeholder="Encargado del board"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div>
                        <span className={styles.label}>URL del board</span>
                        <input
                          type="url"
                          className={styles.tableInput}
                          value={miroEditDraft.url}
                          onChange={(event) => setMiroEditDraft((prev) => ({ ...prev, url: event.target.value }))}
                        />
                      </div>
                      <div className={styles.cuotaActions}>
                        <button type="button" className={styles.saveBtn} onClick={() => guardarEditMiro(board.id)} disabled={miroSaving}>
                          {miroSaving ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button type="button" className={styles.cancelBtn} onClick={cancelEditMiro}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={board.id} className={styles.miroDocCard}>
                      <a
                        href={board.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.miroDocLink}
                      >
                        <div className={styles.miroDocPreview}>
                          <img src="/logos/miro.png" alt="" className={styles.miroDocIcon} />
                        </div>
                        <p className={styles.miroDocTitle}>{board.titulo}</p>
                      </a>
                      <div className={styles.miroDocActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="Editar board"
                          onClick={() => startEditMiro(board)}
                        >
                          <i className="ti ti-pencil" />
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="Eliminar board"
                          onClick={() => eliminarMiro(board.id)}
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  )
                )) : !miroOpen ? (
                  <p className={styles.muted}>Sin boards de Miro. Agregá uno con el botón de arriba.</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className={`${styles.quadTile} ${styles.brandTile}`}>
            <div className={`${styles.brandHeader} ${styles.brandHeaderFathom}`}>
              <img src="/logos/fathom.png" alt="Fathom" className={styles.brandLogoFathom} />
            </div>
            <div className={styles.linkTileBody}>
              <div className={styles.miroToolbar}>
                <span className={styles.label}>Grabaciones</span>
                <button type="button" className={styles.arregloCloserBtn} onClick={openFathomForm}>
                  + Agregar Fathom
                </button>
              </div>

              {fathomOpen ? (
                <div className={styles.miroFormPanel}>
                  <div>
                    <span className={styles.label}>Título</span>
                    <div className={styles.boardTituloRow}>
                      <span className={styles.boardTituloPrefix}>{cliente.nombre} -</span>
                      <input
                        type="text"
                        className={`${styles.tableInput} ${styles.boardTituloInput}`}
                        value={fathomDraft.encargado}
                        onChange={(event) => setFathomDraft((prev) => ({ ...prev, encargado: event.target.value.toUpperCase() }))}
                        placeholder="Encargado del board"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div>
                    <span className={styles.label}>URL de la grabación</span>
                    <input
                      type="url"
                      className={styles.tableInput}
                      value={fathomDraft.url}
                      onChange={(event) => setFathomDraft((prev) => ({ ...prev, url: event.target.value }))}
                      placeholder="https://fathom.video/calls/..."
                    />
                  </div>
                  {fathomError ? <p className={styles.error}>{fathomError}</p> : null}
                  <div className={styles.cuotaActions}>
                    <button type="button" className={styles.saveBtn} onClick={guardarFathom} disabled={fathomSaving}>
                      {fathomSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button type="button" className={styles.cancelBtn} onClick={closeFathomForm}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              {fathomError && !fathomOpen ? <p className={styles.error}>{fathomError}</p> : null}

              <div className={styles.miroGrid}>
                {cliente.fathoms?.length ? cliente.fathoms.map((board) => (
                  editingFathomId === board.id ? (
                    <div key={board.id} className={`${styles.miroFormPanel} ${styles.miroFormPanelWide}`}>
                      <div>
                        <span className={styles.label}>Título</span>
                        <div className={styles.boardTituloRow}>
                          <span className={styles.boardTituloPrefix}>{cliente.nombre} -</span>
                          <input
                            type="text"
                            className={`${styles.tableInput} ${styles.boardTituloInput}`}
                            value={fathomEditDraft.encargado}
                            onChange={(event) => setFathomEditDraft((prev) => ({ ...prev, encargado: event.target.value.toUpperCase() }))}
                            placeholder="Encargado del board"
                            autoFocus
                          />
                        </div>
                      </div>
                      <div>
                        <span className={styles.label}>URL de la grabación</span>
                        <input
                          type="url"
                          className={styles.tableInput}
                          value={fathomEditDraft.url}
                          onChange={(event) => setFathomEditDraft((prev) => ({ ...prev, url: event.target.value }))}
                        />
                      </div>
                      <div className={styles.cuotaActions}>
                        <button type="button" className={styles.saveBtn} onClick={() => guardarEditFathom(board.id)} disabled={fathomSaving}>
                          {fathomSaving ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button type="button" className={styles.cancelBtn} onClick={cancelEditFathom}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={board.id} className={styles.miroDocCard}>
                      <a
                        href={board.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.miroDocLink}
                      >
                        <div className={styles.fathomDocPreview}>
                          <img src="/logos/fathom.png" alt="" className={styles.fathomDocIcon} />
                        </div>
                        <p className={styles.miroDocTitle}>{board.titulo}</p>
                      </a>
                      <div className={styles.miroDocActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="Editar grabación"
                          onClick={() => startEditFathom(board)}
                        >
                          <i className="ti ti-pencil" />
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="Eliminar grabación"
                          onClick={() => eliminarFathom(board.id)}
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                  )
                )) : !fathomOpen ? (
                  <p className={styles.muted}>Sin grabaciones de Fathom. Agregá una con el botón de arriba.</p>
                ) : null}
              </div>
            </div>
          </section>
        </div>

        <div className={styles.quadGrid}>
          <section className={`${styles.quadTile} ${styles.observacionesTile}`}>
            <div className={styles.observacionesHeader}>
              <h2 className={styles.cardTitle}>Observaciones</h2>
              <button type="button" className={styles.arregloCloserBtn} onClick={openObservacion}>
                + Agregar observación
              </button>
            </div>

            {observacionOpen ? (
              <div className={styles.observacionPanel}>
                <div>
                  <span className={styles.label}>Quién</span>
                  <input
                    type="text"
                    className={styles.tableInput}
                    value={observacionDraft.autor}
                    onChange={(event) => setObservacionDraft((prev) => ({ ...prev, autor: event.target.value }))}
                    placeholder="Nombre de quien registra la observación"
                    autoFocus
                  />
                </div>
                <div>
                  <span className={styles.label}>Observación</span>
                  <textarea
                    className={styles.arregloCloserTextarea}
                    value={observacionDraft.texto}
                    onChange={(event) => setObservacionDraft((prev) => ({ ...prev, texto: event.target.value }))}
                    placeholder="Detalle de la observación sobre el cliente..."
                  />
                </div>
                {observacionError ? <p className={styles.error}>{observacionError}</p> : null}
                <div className={styles.cuotaActions}>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={guardarObservacion}
                    disabled={observacionSaving}
                  >
                    {observacionSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" className={styles.cancelBtn} onClick={closeObservacion}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            <div className={styles.observacionesList}>
              {cliente.observaciones?.length ? cliente.observaciones.map((obs) => (
                <div key={obs.id} className={styles.observacionItem}>
                  <div className={styles.observacionMeta}>
                    <div>
                      <span className={styles.observacionAutor}>{obs.autor}</span>
                      <span className={styles.muted}> · {formatDateTime(obs.created_at)}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label="Eliminar observación"
                      onClick={() => eliminarObservacion(obs.id)}
                    >
                      <i className="ti ti-trash" />
                    </button>
                  </div>
                  <p className={styles.observacionTexto}>{obs.texto}</p>
                </div>
              )) : (
                <p className={styles.muted}>Sin observaciones registradas.</p>
              )}
            </div>
          </section>

          <section className={styles.quadTile}>
            <div className={styles.observacionesHeader}>
              <h2 className={styles.cardTitle}>Próximos pasos</h2>
              <button type="button" className={styles.arregloCloserBtn} onClick={openProximosPasos}>
                + Agregar
              </button>
            </div>

            {proximosPasosOpen ? (
              <div className={styles.observacionPanel}>
                <ProximosPasosFormFields
                  draft={proximosPasosDraft}
                  setDraft={setProximosPasosDraft}
                  autoFocus
                />
                {proximosPasosError ? <p className={styles.error}>{proximosPasosError}</p> : null}
                <div className={styles.cuotaActions}>
                  <button
                    type="button"
                    className={styles.saveBtn}
                    onClick={guardarProximosPasos}
                    disabled={proximosPasosSaving}
                  >
                    {proximosPasosSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" className={styles.cancelBtn} onClick={closeProximosPasos}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            {proximosPasosError && !proximosPasosOpen && !editingProximosPasosId ? (
              <p className={styles.error}>{proximosPasosError}</p>
            ) : null}

            <div
              className={styles.observacionesList}
              style={{
                maxHeight: editingProximosPasosId ? 'none' : 320,
                overflowY: editingProximosPasosId ? 'visible' : 'auto',
              }}
            >
              {cliente.proximos_pasos?.length ? cliente.proximos_pasos.map((paso) => (
                editingProximosPasosId === paso.id ? (
                  <div key={paso.id} className={`${styles.observacionPanel} ${styles.proximosPasosEditPanel}`}>
                    <ProximosPasosFormFields
                      draft={proximosPasosEditDraft}
                      setDraft={setProximosPasosEditDraft}
                      autoFocus
                      expanded
                    />
                    {proximosPasosError ? <p className={styles.error}>{proximosPasosError}</p> : null}
                    <div className={styles.cuotaActions}>
                      <button
                        type="button"
                        className={styles.saveBtn}
                        onClick={() => guardarEditProximosPasos(paso.id)}
                        disabled={proximosPasosSaving}
                      >
                        {proximosPasosSaving ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button type="button" className={styles.cancelBtn} onClick={cancelEditProximosPasos}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={paso.id} className={styles.observacionItem}>
                    <div className={styles.observacionMeta}>
                      <span className={styles.muted}>
                        {formatDate(paso.fecha_llamada)} · {paso.mentor}
                      </span>
                      <div className={styles.itemActions}>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="Editar próximos pasos"
                          onClick={() => startEditProximosPasos(paso)}
                        >
                          <i className="ti ti-pencil" />
                        </button>
                        <button
                          type="button"
                          className={styles.iconBtn}
                          aria-label="Eliminar próximos pasos"
                          onClick={() => eliminarProximosPasos(paso.id)}
                        >
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </div>
                    {paso.contenido && paso.contenido !== '—' ? (
                      <p className={styles.observacionTexto}>{paso.contenido}</p>
                    ) : null}
                    {paso.link ? (
                      <a
                        href={paso.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.externalBtn}
                      >
                        <img src="/logos/google-docs.png" alt="" className={styles.docsLogo} />
                        {` - ${paso.mentor}`}
                      </a>
                    ) : null}
                  </div>
                )
              )) : (
                <p className={styles.muted}>Sin próximos pasos registrados.</p>
              )}
            </div>
          </section>
        </div>

        <div className={styles.quadGrid}>
          <section className={`${styles.quadTile} ${styles.financieroTile}`}>
            <div className={styles.financieroHeader}>
              <h2 className={styles.cardTitle}>Financiero</h2>
              <div className={styles.financieroHeaderActions}>
                <button
                  type="button"
                  className={styles.arregloCloserBtn}
                  onClick={openArregloCloser}
                >
                  Arreglo closer{cliente.arreglo_closer ? ' · guardado' : ''}
                </button>
                <button
                  type="button"
                  className={styles.payBtn}
                  onClick={() => {
                    resetEditCuota()
                    setNewCuota(emptyNewCuota(cliente))
                    setAddingCuota(true)
                  }}
                >
                  + Agregar cuota
                </button>
              </div>
            </div>

            {arregloCloserOpen ? (
              <div className={styles.arregloCloserOverlay} onClick={closeArregloCloser}>
                <div
                  className={styles.arregloCloserPanel}
                  onClick={(event) => event.stopPropagation()}
                >
                  <h3 className={styles.arregloCloserTitle}>Arreglo closer</h3>
                  <p className={styles.arregloCloserHint}>
                    Lo que pactó el closer en llamada. El VA usa esto para armar el plan de cuotas.
                  </p>
                  <textarea
                    className={styles.arregloCloserTextarea}
                    value={arregloCloserDraft}
                    onChange={(event) => setArregloCloserDraft(event.target.value)}
                    placeholder="Total acordado, cuotas y plan. Ej: US$ 2400 en 3 — US$ 800 al ingresar, US$ 800 al mes 1, US$ 800 al mes 2. Boost 8 meses."
                    autoFocus
                  />
                  <div className={styles.cuotaActions}>
                    <button
                      type="button"
                      className={styles.saveBtn}
                      onClick={guardarArregloCloser}
                      disabled={arregloCloserSaving}
                    >
                      {arregloCloserSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button type="button" className={styles.cancelBtn} onClick={closeArregloCloser}>
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className={styles.tileGrid}>
              <div>
                <span className={styles.label}>Total pagado USD</span>
                <p>{formatUsd(cliente.total_pagado_usd)}</p>
              </div>
              <div>
                <span className={styles.label}>Total adeudado USD</span>
                <p>{formatUsd(cliente.total_adeudado_usd)}</p>
              </div>
            </div>

            {cuotaError ? <p className={styles.error}>{cuotaError}</p> : null}

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Monto</th>
                    <th>Vence</th>
                    <th>Pago</th>
                    <th>Estado</th>
                    <th>Tipo</th>
                    <th>Comprobante</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cliente.cuotas?.length ? cliente.cuotas.map((cuota) => (
                    editingCuotaId === cuota.id ? (
                      <tr
                        key={cuota.id}
                        className={styles.cuotaRowEdit}
                        onKeyDown={(event) => handleCuotaRowKeyDown(event, () => guardarEditCuota(cuota.id), resetEditCuota)}
                      >
                        <td data-label="Monto" className={styles.cuotaMonto}>
                          <input
                            type="number"
                            className={styles.tableInput}
                            value={editCuota.monto_usd}
                            onChange={(e) => setEditCuota((prev) => ({ ...prev, monto_usd: e.target.value }))}
                          />
                        </td>
                        <td data-label="Vence" className={styles.cuotaVence}>
                          <input
                            type="date"
                            className={styles.tableInput}
                            value={editCuota.fecha_vence}
                            onChange={(e) => handleCuotaFechaChange(setEditCuota, e, setCuotaError)}
                          />
                        </td>
                        <td data-label="Pago" className={styles.cuotaPago}>
                          <input
                            type="date"
                            className={styles.tableInput}
                            value={editCuota.fecha_pago}
                            onChange={(e) => handleCuotaFechaChange(setEditCuota, e, setCuotaError, 'fecha_pago')}
                          />
                        </td>
                        <td data-label="Estado" className={styles.cuotaEstado}>
                          <span className={styles.cuotaEstadoBadge} data-estado={cuota.estado}>{cuota.estado}</span>
                        </td>
                        <td data-label="Tipo" className={styles.cuotaTipo}>
                          <select
                            className={styles.tableInput}
                            value={editCuota.notas}
                            onChange={(e) => setEditCuota((prev) => ({ ...prev, notas: e.target.value }))}
                          >
                            {TIPOS_CUOTA_NOTA.map((opt) => (
                              <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        {renderComprobanteCell(cuota)}
                        <td data-label="Acciones" className={styles.cuotaAcciones}>
                          <div className={styles.cuotaActions}>
                            <button type="button" className={styles.saveBtn} onClick={() => guardarEditCuota(cuota.id)}>
                              Guardar
                            </button>
                            <button type="button" className={styles.cancelBtn} onClick={resetEditCuota}>
                              Cancelar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={cuota.id}>
                        <td data-label="Monto" className={styles.cuotaMonto}>{formatUsd(cuota.monto_usd)}</td>
                        <td data-label="Vence" className={styles.cuotaVence}>{formatDate(cuota.fecha_vence)}</td>
                        <td data-label="Pago" className={styles.cuotaPago}>{formatDate(cuota.fecha_pago)}</td>
                        <td data-label="Estado" className={styles.cuotaEstado}>
                          <span className={styles.cuotaEstadoBadge} data-estado={cuota.estado}>{cuota.estado}</span>
                        </td>
                        <td data-label="Tipo" className={styles.cuotaTipo}>{labelTipoCuotaNota(cuota.notas, cuota.nota_label)}</td>
                        {renderComprobanteCell(cuota)}
                        <td data-label="Acciones" className={styles.cuotaAcciones}>
                          <div className={styles.cuotaActions}>
                            {cuota.estado !== 'pagado' ? (
                              <button type="button" className={styles.payBtn} onClick={() => marcarPagado(cuota.id)}>
                                Marcar pagado
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={styles.iconBtn}
                              aria-label="Editar cuota"
                              onClick={() => startEditCuota(cuota)}
                            >
                              <i className="ti ti-pencil" />
                            </button>
                            <button
                              type="button"
                              className={styles.iconBtn}
                              aria-label="Eliminar cuota"
                              onClick={() => eliminarCuota(cuota.id)}
                            >
                              <i className="ti ti-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )) : !addingCuota ? (
                    <tr>
                      <td colSpan={7} className={styles.muted}>Sin cuotas registradas</td>
                    </tr>
                  ) : null}
                  {addingCuota ? (
                    <>
                    <tr
                      className={styles.cuotaRowEdit}
                      onKeyDown={(event) => handleCuotaRowKeyDown(event, guardarNuevaCuota, resetNewCuota)}
                    >
                      <td data-label="Monto" className={styles.cuotaMonto}>
                        <input
                          type="number"
                          className={styles.tableInput}
                          placeholder="Monto USD"
                          value={newCuota.monto_usd}
                          onChange={(e) => setNewCuota((prev) => ({ ...prev, monto_usd: e.target.value }))}
                        />
                      </td>
                      <td data-label="Vence" className={styles.cuotaVence}>
                        <input
                          type="date"
                          className={styles.tableInput}
                          value={newCuota.fecha_vence}
                          onChange={(e) => handleCuotaFechaChange(setNewCuota, e, setCuotaError)}
                        />
                      </td>
                      <td data-label="Pago" className={styles.cuotaPago}>—</td>
                      <td data-label="Estado" className={styles.cuotaEstado}>
                        <span className={styles.cuotaEstadoBadge} data-estado="pendiente">pendiente</span>
                      </td>
                      <td data-label="Tipo" className={styles.cuotaTipo}>
                        <select
                          className={styles.tableInput}
                          value={newCuota.notas}
                          onChange={(e) => {
                            const notas = e.target.value
                            setNewCuota((prev) => ({
                              ...prev,
                              notas,
                              fecha_inicio: prev.fecha_inicio || todayInputDate(),
                              duracion_meses: prev.duracion_meses || defaultDuracionMeses(cliente),
                              renovarPrograma: TIPOS_RENOVACION.has(notas) ? null : prev.renovarPrograma,
                            }))
                          }}
                        >
                          {TIPOS_CUOTA_NOTA.map((opt) => (
                            <option key={opt.value || 'none'} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Comprobante">—</td>
                      <td data-label="Acciones" className={styles.cuotaAcciones}>
                        <div className={styles.cuotaActions}>
                          <button type="button" className={styles.saveBtn} onClick={guardarNuevaCuota}>
                            Guardar
                          </button>
                          <button type="button" className={styles.cancelBtn} onClick={resetNewCuota}>
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                    {TIPOS_RENOVACION.has(newCuota.notas) ? (
                      <tr onKeyDown={(event) => handleCuotaRowKeyDown(event, guardarNuevaCuota, resetNewCuota)}>
                        <td colSpan={7} data-span>
                          <div className={styles.renovarBox}>
                            <p className={styles.renovarTitle}>
                              ¿Establecer un nuevo período de vencimiento?
                            </p>
                            <p className={styles.renovarHint}>
                              {newCuota.notas === 'cuota_recompra' ? 'Recompra' : 'Upsell'}
                              : podés renovar el programa o solo cargar la cuota.
                            </p>
                            <div className={styles.renovarChoice}>
                              <button
                                type="button"
                                className={[
                                  styles.renovarChoiceBtn,
                                  newCuota.renovarPrograma === true ? styles.renovarChoiceBtnOn : '',
                                ].filter(Boolean).join(' ')}
                                onClick={() => setNewCuota((prev) => ({ ...prev, renovarPrograma: true }))}
                              >
                                Sí, renovar vencimiento
                              </button>
                              <button
                                type="button"
                                className={[
                                  styles.renovarChoiceBtn,
                                  newCuota.renovarPrograma === false ? styles.renovarChoiceBtnOn : '',
                                ].filter(Boolean).join(' ')}
                                onClick={() => setNewCuota((prev) => ({ ...prev, renovarPrograma: false }))}
                              >
                                No, solo la cuota
                              </button>
                            </div>
                            {newCuota.renovarPrograma === false ? (
                              <p className={styles.renovarHint}>
                                Se guarda la cuota sin cambiar inicio ni vencimiento del programa.
                              </p>
                            ) : null}
                            {newCuota.renovarPrograma === true ? (
                            <div className={styles.renovarGrid}>
                              <label>
                                <span className={styles.label}>Nueva fecha de inicio</span>
                                <input
                                  type="date"
                                  className={styles.tableInput}
                                  value={newCuota.fecha_inicio}
                                  onChange={(e) => setNewCuota((prev) => ({ ...prev, fecha_inicio: e.target.value }))}
                                />
                              </label>
                              <label>
                                <span className={styles.label}>Duración (meses)</span>
                                <select
                                  className={styles.tableInput}
                                  value={newCuota.duracion_meses}
                                  onChange={(e) => setNewCuota((prev) => ({ ...prev, duracion_meses: e.target.value }))}
                                >
                                  {MESES_DURACION.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                              </label>
                              <div>
                                <span className={styles.label}>Nuevo vencimiento</span>
                                <p className={styles.renovarVence}>
                                  {formatDate(calcFechaVencimiento(
                                    newCuota.fecha_inicio,
                                    cliente.plan_actual,
                                    newCuota.duracion_meses,
                                  )) || '—'}
                                </p>
                              </div>
                            </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.quadTile}>
            <h2 className={styles.cardTitle}>Comercial</h2>
            <div className={styles.tileGrid}>
              <div>
                <span className={styles.label}>Estado manual</span>
                <InlineField
                  type="select"
                  variant="chip"
                  value={cliente.estado_cliente}
                  displayValue={<StatusBadge estado={cliente.estado_cliente} />}
                  options={ESTADOS_CLIENTE}
                  onSave={(value) => updateField('estado_cliente', value)}
                />
              </div>
              <div>
                <span className={styles.label}>Oportunidad</span>
                <InlineField
                  type="select"
                  value={cliente.oportunidad || ''}
                  displayValue={formatOportunidad(cliente.oportunidad)}
                  options={OPORTUNIDADES}
                  onSave={(value) => updateField('oportunidad', value || null)}
                />
              </div>
              <div>
                <span className={styles.label}>Responsable upsell / recompra</span>
                <InlineField
                  type="select"
                  variant="chip"
                  value={cliente.responsable || ''}
                  displayValue={formatResponsable(cliente.responsable)}
                  options={RESPONSABLES}
                  onSave={(value) => updateField('responsable', value || null)}
                />
                {!cliente.responsable && ['upsell_boost', 'upsell_advantage', 'recompra'].includes(cliente.oportunidad) ? (
                  <p className={styles.muted} style={{ marginTop: 6 }}>
                    Asigná un responsable para que nadie más pitchee este cliente.
                  </p>
                ) : null}
              </div>
              <div>
                <span className={styles.label}>Prioridad cobro</span>
                <InlineField
                  type="select"
                  value={cliente.prioridad_cobro || ''}
                  displayValue={formatPrioridad(cliente.prioridad_cobro)}
                  options={PRIORIDADES}
                  onSave={(value) => updateField('prioridad_cobro', value || null)}
                />
              </div>
            </div>
          </section>
        </div>

        <div className={styles.quadGrid}>
          <section className={styles.quadTile}>
            <div className={styles.miroToolbar}>
              <div>
                <h2 className={styles.cardTitle}>Transcript de Discord</h2>
                <div className={styles.discordStatusRow}>
                  {discordEstado.actualizando || discordActualizando ? (
                    <>
                      <span className={`${styles.discordDot} ${styles.discordDotPulse}`} />
                      <span className={styles.discordStatusText}>Estado: actualizando...</span>
                    </>
                  ) : discordEstadoLabel === 'error' ? (
                    <>
                      <span className={`${styles.discordDot} ${styles.discordDotError}`} />
                      <span className={styles.discordStatusText}>Estado: error</span>
                    </>
                  ) : discordEstado.ultima_actualizacion ? (
                    <>
                      <span className={`${styles.discordDot} ${styles.discordDotOk}`} />
                      <span className={styles.discordStatusText}>
                        Estado: ok · Última:{' '}
                        {formatDateTime(discordEstado.ultima_actualizacion)}
                        {countdownDisplay ? ` · Próxima en ${countdownDisplay}` : ''}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className={styles.miroToolbarActions}>
                <button
                  type="button"
                  className={styles.arregloCloserBtn}
                  onClick={handleActualizarTranscript}
                  disabled={discordActualizando || discordEstado.actualizando}
                >
                  {discordActualizando ? 'Actualizando...' : 'Actualizar'}
                </button>
                <button type="button" className={styles.arregloCloserBtn} onClick={openDiscordForm}>
                  + Agregar transcript
                </button>
              </div>
            </div>

            {discordOpen ? (
              <div className={styles.miroFormPanel}>
                <div>
                  <span className={styles.label}>Título (opcional)</span>
                  <input
                    type="text"
                    className={styles.tableInput}
                    value={discordDraft.titulo}
                    onChange={(event) => setDiscordDraft((prev) => ({ ...prev, titulo: event.target.value.toUpperCase() }))}
                    placeholder="Nombre del transcript"
                  />
                </div>
                <div>
                  <span className={styles.label}>Archivo .txt</span>
                  <input
                    type="file"
                    accept=".txt,text/plain"
                    className={styles.fileInput}
                    onChange={(event) => setDiscordDraft((prev) => ({ ...prev, file: event.target.files?.[0] || null }))}
                  />
                </div>
                {discordError ? <p className={styles.error}>{discordError}</p> : null}
                <div className={styles.cuotaActions}>
                  <button type="button" className={styles.saveBtn} onClick={guardarDiscord} disabled={discordSaving}>
                    {discordSaving ? 'Subiendo...' : 'Guardar'}
                  </button>
                  <button type="button" className={styles.cancelBtn} onClick={closeDiscordForm}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            {discordError && !discordOpen ? <p className={styles.error}>{discordError}</p> : null}

            <div className={styles.botTranscriptList}>
              {botTranscripts.length ? botTranscripts.map((t) => (
                selectedBotTranscript?.id === t.id ? (
                  <div key={t.id} className={styles.botTranscriptViewer}>
                    <div className={styles.botTranscriptViewerHeader}>
                      <span className={styles.botTranscriptViewerTitle}>
                        #{t.canal} — {formatDate(t.fecha)}
                      </span>
                      <div className={styles.botTranscriptViewerActions}>
                        <button
                          type="button"
                          className={styles.arregloCloserBtn}
                          onClick={() => {
                            const blob = new Blob([botTranscriptContenido], { type: 'text/plain' })
                            const url = URL.createObjectURL(blob)
                            const a = document.createElement('a')
                            a.href = url
                            a.download = `${t.canal}-${t.fecha}.txt`
                            a.click()
                            URL.revokeObjectURL(url)
                          }}
                        >
                          Descargar .txt
                        </button>
                        <button
                          type="button"
                          className={styles.cancelBtn}
                          onClick={cerrarBotTranscript}
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                    {botTranscriptLoading ? (
                      <p className={styles.muted}>Cargando...</p>
                    ) : (
                      <pre className={styles.botTranscriptPre}>{botTranscriptContenido}</pre>
                    )}
                  </div>
                ) : (
                  <div key={t.id} className={styles.botTranscriptItem}>
                    <div className={styles.botTranscriptItemInfo}>
                      <span className={styles.botTranscriptCanal}>#{t.canal}</span>
                      <span className={styles.botTranscriptMeta}>
                        {t.categoria.toUpperCase()} · {formatDate(t.fecha)} · {t.mensajes} msgs
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.arregloCloserBtn}
                      onClick={() => verBotTranscript(t)}
                    >
                      Ver
                    </button>
                  </div>
                )
              )) : (
                <p className={styles.muted}>
                  {discordActualizando ? 'Actualizando...' : 'Sin transcripts automáticos aún.'}
                </p>
              )}
            </div>
          </section>

          <section className={styles.quadTile}>
            <div className={styles.miroToolbar}>
              <h2 className={styles.cardTitle}>Links de documentos</h2>
              <button type="button" className={styles.arregloCloserBtn} onClick={openDocumentoForm}>
                + Agregar link
              </button>
            </div>

            {documentoOpen ? (
              <div className={styles.miroFormPanel}>
                <div>
                  <span className={styles.label}>Título</span>
                  <input
                    type="text"
                    className={styles.tableInput}
                    value={documentoDraft.titulo}
                    onChange={(event) => setDocumentoDraft((prev) => ({ ...prev, titulo: event.target.value.toUpperCase() }))}
                    placeholder="Ej: Contrato firmado"
                    autoFocus
                  />
                </div>
                <div>
                  <span className={styles.label}>URL del documento</span>
                  <input
                    type="url"
                    className={styles.tableInput}
                    value={documentoDraft.url}
                    onChange={(event) => setDocumentoDraft((prev) => ({ ...prev, url: event.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                {documentoError ? <p className={styles.error}>{documentoError}</p> : null}
                <div className={styles.cuotaActions}>
                  <button type="button" className={styles.saveBtn} onClick={guardarDocumento} disabled={documentoSaving}>
                    {documentoSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" className={styles.cancelBtn} onClick={closeDocumentoForm}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            {documentoError && !documentoOpen ? <p className={styles.error}>{documentoError}</p> : null}

            <div className={styles.miroGrid}>
              {cliente.documento_links?.length ? cliente.documento_links.map((link) => (
                editingDocumentoId === link.id ? (
                  <div key={link.id} className={`${styles.miroFormPanel} ${styles.miroFormPanelWide}`}>
                    <div>
                      <span className={styles.label}>Título</span>
                      <input
                        type="text"
                        className={styles.tableInput}
                        value={documentoEditDraft.titulo}
                        onChange={(event) => setDocumentoEditDraft((prev) => ({ ...prev, titulo: event.target.value.toUpperCase() }))}
                        autoFocus
                      />
                    </div>
                    <div>
                      <span className={styles.label}>URL del documento</span>
                      <input
                        type="url"
                        className={styles.tableInput}
                        value={documentoEditDraft.url}
                        onChange={(event) => setDocumentoEditDraft((prev) => ({ ...prev, url: event.target.value }))}
                      />
                    </div>
                    <div className={styles.cuotaActions}>
                      <button type="button" className={styles.saveBtn} onClick={() => guardarEditDocumento(link.id)} disabled={documentoSaving}>
                        {documentoSaving ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button type="button" className={styles.cancelBtn} onClick={cancelEditDocumento}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={link.id} className={styles.miroDocCard}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.miroDocLink}
                    >
                      <div className={styles.documentoDocPreview}>
                        <i className={`ti ti-file-text ${styles.documentoDocIcon}`} />
                      </div>
                      <p className={styles.miroDocTitle}>{link.titulo}</p>
                    </a>
                    <div className={styles.miroDocActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label="Editar link"
                        onClick={() => startEditDocumento(link)}
                      >
                        <i className="ti ti-pencil" />
                      </button>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label="Eliminar link"
                        onClick={() => eliminarDocumento(link.id)}
                      >
                        <i className="ti ti-trash" />
                      </button>
                    </div>
                  </div>
                )
              )) : !documentoOpen ? (
                <p className={styles.muted}>Sin links de documentos. Agregá uno con el botón de arriba.</p>
              ) : null}
            </div>
          </section>
        </div>

        <section className={styles.card}>
          <button type="button" className={styles.accordionBtn} onClick={() => setFormOpen((prev) => !prev)}>
            <span>Formulario de onboarding ({cliente.formulario_onboarding?.length || 0} respuestas)</span>
            <i className={`ti ${formOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
          </button>
          {formOpen ? (
            <div className={styles.formList}>
              {cliente.formulario_onboarding?.length ? cliente.formulario_onboarding.map((item, index) => (
                <div key={`${item.pregunta}-${index}`} className={styles.formItem}>
                  <p className={styles.formQuestion}>{item.pregunta}</p>
                  <p className={styles.formAnswer}>{item.respuesta}</p>
                </div>
              )) : (
                <p className={styles.muted}>No hay formulario de onboarding para este cliente.</p>
              )}
            </div>
          ) : null}
        </section>
      </main>
      <input
        ref={comprobanteInputRef}
        type="file"
        accept={COMPROBANTE_ACCEPT}
        multiple
        className={styles.hiddenFileInput}
        onChange={onComprobanteSeleccionado}
      />
      {comprobanteView && comprobanteActual ? (
        <div
          className={styles.comprobanteOverlay}
          onClick={() => setComprobanteView(null)}
        >
          <div
            className={styles.comprobantePanel}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.comprobantePanelHeader}>
              <h3 className={styles.comprobanteTitle}>
                Comprobantes
                {comprobantesVisibles.length > 1
                  ? ` · ${comprobanteIndex + 1} / ${comprobantesVisibles.length}`
                  : ''}
              </h3>
              <button
                type="button"
                className={styles.iconBtn}
                aria-label="Cerrar comprobantes"
                onClick={() => setComprobanteView(null)}
              >
                <i className="ti ti-x" />
              </button>
            </div>
            {comprobanteActual.nombre ? (
              <p className={styles.comprobanteNombre}>{comprobanteActual.nombre}</p>
            ) : null}
            <div className={styles.comprobanteViewer}>
              {comprobantesVisibles.length > 1 ? (
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Comprobante anterior"
                  disabled={comprobanteIndex === 0}
                  onClick={() => {
                    setComprobanteImgError(false)
                    setComprobanteView((prev) => ({ ...prev, index: prev.index - 1 }))
                  }}
                >
                  <i className="ti ti-chevron-left" />
                </button>
              ) : null}
              {comprobanteImgError ? (
                <p className={styles.error}>No se pudo cargar la imagen del comprobante.</p>
              ) : (
                <img
                  src={`${cuotaComprobanteUrl(clienteId, comprobanteView.cuotaId, comprobanteActual.id)}?v=${comprobanteNonce}`}
                  alt={`Comprobante ${comprobanteIndex + 1}`}
                  className={styles.comprobanteImg}
                  onError={() => setComprobanteImgError(true)}
                />
              )}
              {comprobantesVisibles.length > 1 ? (
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Comprobante siguiente"
                  disabled={comprobanteIndex >= comprobantesVisibles.length - 1}
                  onClick={() => {
                    setComprobanteImgError(false)
                    setComprobanteView((prev) => ({ ...prev, index: prev.index + 1 }))
                  }}
                >
                  <i className="ti ti-chevron-right" />
                </button>
              ) : null}
            </div>
            <div className={styles.cuotaActions}>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={() => abrirSelectorComprobante(comprobanteView.cuotaId)}
                disabled={comprobanteSaving}
              >
                Agregar otro
              </button>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => eliminarComprobante(comprobanteView.cuotaId, comprobanteActual.id)}
                disabled={comprobanteSaving}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
