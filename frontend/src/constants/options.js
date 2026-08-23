export const ESTADOS_CLIENTE = [
  { value: 'vigente', label: 'Vigente' },
  { value: 'proximo_a_vencer', label: 'Próximo a vencer' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'pausa', label: 'Pausa' },
  { value: 'no_va_a_renovar', label: 'No va a renovar' },
  { value: 'llamada_recompra', label: 'Llamada recompra' },
  { value: 'estan_bien', label: 'Están bien' },
  { value: 'inactivo', label: 'Inactivo' },
]

export const ESTADOS_FILTRO = [
  { value: '', label: 'Todos los estados' },
  ...ESTADOS_CLIENTE,
]

export const MESES_DURACION = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1)
  return { value, label: value === '1' ? '1 mes' : `${value} meses` }
})

export const PLANES_CLIENTE = [
  { value: 'mentoria', label: 'Mentoría' },
  { value: 'boost', label: 'Boost' },
  { value: 'advantage', label: 'Advantage' },
]

export const PLANES = [
  { value: '', label: 'Todos los planes' },
  ...PLANES_CLIENTE,
]

export const OPORTUNIDADES = [
  { value: '', label: 'Sin oportunidad' },
  { value: 'upsell_boost', label: 'Upsell Boost' },
  { value: 'upsell_advantage', label: 'Upsell Advantage' },
  { value: 'recompra', label: 'Recompra' },
  { value: 'consultar', label: 'Consultar' },
]

export const TIPOS_CUOTA_NOTA = [
  { value: 'cuota_venta', label: 'Cuota venta' },
  { value: 'cuota_upsell', label: 'Cuota upsell' },
  { value: 'cuota_recompra', label: 'Cuota recompra' },
  { value: 'posibilidad_upsell', label: 'Posibilidad upsell' },
  { value: 'sena', label: 'Seña' },
]

const TIPOS_CUOTA_VALIDOS = new Set(TIPOS_CUOTA_NOTA.map((item) => item.value))

const TIPOS_CUOTA_LEGACY = {
  cuota: 'cuota_venta',
  venta: 'cuota_venta',
  cuota_venta: 'cuota_venta',
  upsell: 'cuota_upsell',
  cuota_upsell: 'cuota_upsell',
  recompra: 'cuota_recompra',
  cuota_recompra: 'cuota_recompra',
  renovacion: 'cuota_recompra',
  sena: 'sena',
  seña: 'sena',
  senia: 'sena',
  posibilidad_upsell: 'posibilidad_upsell',
  posibilidad: 'posibilidad_upsell',
  posible_upsell: 'posibilidad_upsell',
}

export function canonicalTipoCuota(value) {
  if (!value) return 'cuota_venta'
  const first = String(value).trim().split('\n')[0].trim().toLowerCase().replace(/ /g, '_')
  if (TIPOS_CUOTA_LEGACY[first]) return TIPOS_CUOTA_LEGACY[first]
  if (TIPOS_CUOTA_VALIDOS.has(first)) return first
  return 'cuota_venta'
}

export function labelTipoCuotaNota(value, fallbackLabel) {
  const canonical = canonicalTipoCuota(value)
  const found = TIPOS_CUOTA_NOTA.find((item) => item.value === canonical)
  if (found?.value) return found.label
  if (fallbackLabel) return fallbackLabel
  return value || '—'
}

export const PRIORIDADES = [
  { value: '', label: 'Sin prioridad' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
]

export const RESPONSABLES = [
  { value: '', label: 'Sin responsable' },
  { value: 'lucas', label: 'Lucas' },
  { value: 'juampi', label: 'Juampi' },
  { value: 'juan', label: 'Juan' },
  { value: 'ale', label: 'Ale' },
]
