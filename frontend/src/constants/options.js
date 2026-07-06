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

export const PRIORIDADES = [
  { value: '', label: 'Sin prioridad' },
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
]
