export function isValidDateISO(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false
  const parsed = new Date(year, month - 1, day)
  return (
    parsed.getFullYear() === year
    && parsed.getMonth() === month - 1
    && parsed.getDate() === day
  )
}

export function parseDateValue(value) {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value !== 'string') return null

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (isoDate) {
    const year = Number(isoDate[1])
    const month = Number(isoDate[2])
    const day = Number(isoDate[3])
    const parsed = new Date(year, month - 1, day)
    if (
      parsed.getFullYear() === year
      && parsed.getMonth() === month - 1
      && parsed.getDate() === day
    ) {
      return parsed
    }
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function parseLocalDate(dateStr) {
  return parseDateValue(dateStr)
}

export function formatLocalDateISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayLocalISO() {
  return formatLocalDateISO(new Date())
}

export function addMonthsToDate(dateStr, months) {
  if (!dateStr || months === null || months === undefined || months === '') return ''
  const date = parseLocalDate(dateStr)
  if (!date) return ''
  date.setMonth(date.getMonth() + Number(months))
  return formatLocalDateISO(date)
}

export function resolveDuracionMeses(plan, duracionMeses) {
  if (duracionMeses) return Number(duracionMeses)
  return MESES_POR_PLAN[plan] || null
}

export function calcFechaVencimiento(fechaInicio, plan, duracionMeses) {
  const months = resolveDuracionMeses(plan, duracionMeses)
  if (!fechaInicio || !months) return ''
  return addMonthsToDate(fechaInicio, months)
}

export const DIAS_POR_MES = 30

export const MESES_POR_PLAN = {
  boost: 8,
  mentoria: 4,
  advantage: 4,
}

export function daysToMonths(days) {
  if (days === null || days === undefined || days === '') return null
  const num = Number(days)
  if (Number.isNaN(num)) return null
  return Math.round(num / DIAS_POR_MES)
}

export function monthsToDays(months) {
  if (months === null || months === undefined || months === '') return null
  const num = Number(months)
  if (Number.isNaN(num)) return null
  return num * DIAS_POR_MES
}

export function formatDuracionMeses(days) {
  const months = daysToMonths(days)
  if (months === null) return '—'
  return months === 1 ? '1 mes' : `${months} meses`
}

export function formatUsd(value) {
  const num = Number(value || 0)
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function formatDate(value) {
  const d = parseDateValue(value)
  if (!d) return '—'
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function formatDateTime(value) {
  const d = parseDateValue(value)
  if (!d) return '—'
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

export function formatPlan(plan) {
  const labels = {
    mentoria: 'Mentoría',
    boost: 'Boost',
    advantage: 'Advantage',
  }
  return labels[plan] || plan
}

export function formatEstado(estado) {
  const labels = {
    vigente: 'Vigente',
    proximo_a_vencer: 'Próximo a vencer',
    vencido: 'Vencido',
    pausa: 'Pausa',
    no_va_a_renovar: 'No va a renovar',
    llamada_recompra: 'Llamada recompra',
    estan_bien: 'Están bien',
    inactivo: 'Inactivo',
  }
  return labels[estado] || estado
}

export function formatOportunidad(value) {
  const labels = {
    upsell_boost: 'Upsell Boost',
    upsell_advantage: 'Upsell Advantage',
    recompra: 'Recompra',
    consultar: 'Consultar',
  }
  return value ? (labels[value] || value) : '—'
}

export function formatPrioridad(value) {
  const labels = {
    alta: 'Alta',
    media: 'Media',
    baja: 'Baja',
  }
  return value ? (labels[value] || value) : '—'
}

export function formatResponsable(value) {
  const labels = {
    lucas: 'Lucas',
    juampi: 'Juampi',
    juan: 'Juan',
    ale: 'Ale',
  }
  return value ? (labels[value] || value) : '—'
}
