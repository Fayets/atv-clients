export function parseLocalDate(dateStr) {
  if (!dateStr) return null
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
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

export function formatDate(value) {
  if (!value) return '—'
  const d = parseLocalDate(value)
  if (!d) return '—'
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
