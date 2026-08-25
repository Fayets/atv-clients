/** Helpers de formato para las páginas de reportes (Marketing y Ventas). */

import { parseDateValue } from './format'

export const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export const ESTADO_VARIANT = {
  'cerrado': 'estadoCerrado',
  'seña': 'estadoSena',
  'sena': 'estadoSena',
  'seguimiento': 'estadoSeguimiento',
  're-agenda': 'estadoReagenda',
  'no show': 'estadoNoShow',
  'descalificado': 'estadoDescalificado',
}

export const TIPO_ICON = {
  reel: 'ti-brand-instagram',
  historia: 'ti-circle-dashed',
  youtube: 'ti-brand-youtube',
  bio: 'ti-link',
  ads: 'ti-speakerphone',
  desconocido: 'ti-help-circle',
}

export function fechaCorta(iso) {
  const d = parseDateValue(iso)
  if (!d) return '—'
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`
}

export function fechaConAnio(iso) {
  const d = parseDateValue(iso)
  if (!d) return '—'
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`
}

export function numero(value) {
  return (Number(value) || 0).toLocaleString('es-AR')
}

export function tasa(parte, total) {
  if (!total) return '—'
  return `${Math.round((Number(parte) / Number(total)) * 100)}%`
}

/** Variación porcentual contra la semana anterior. */
export function delta(actual, anterior) {
  const a = Number(actual) || 0
  const b = Number(anterior) || 0
  if (!b) return a ? { pct: 100, dir: 'up' } : { pct: 0, dir: 'flat' }
  const pct = Math.round(((a - b) / b) * 100)
  if (pct === 0) return { pct: 0, dir: 'flat' }
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : 'down' }
}
