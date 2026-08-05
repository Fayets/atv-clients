/** Solo Win y Upsell se muestran en la interfaz de análisis. */
export const CATEGORIAS_VISIBLES = new Set(['win', 'upsell'])

export const CATEGORIA_META = {
  win: { label: 'Win', icon: 'ti-trophy', tone: 'win' },
  upsell: { label: 'Upsell', icon: 'ti-trending-up', tone: 'upsell' },
}

export const CATEGORIA_DESCRIPCION = {
  win: 'Generó ingresos gracias al programa.',
  upsell: 'Generó ingresos, buen estado en el producto — candidato a subir de plan.',
}

export function requiereAccion(item) {
  const categoria = item.categoria || item.tipo
  return Boolean(categoria && CATEGORIAS_VISIBLES.has(categoria))
}

export function filtrarAccionables(items) {
  if (!Array.isArray(items)) return []
  return items.filter(requiereAccion)
}

export const CATEGORIAS_FILTRO = [
  { value: 'todos', label: 'Todos' },
  { value: 'win', label: 'Win' },
  { value: 'upsell', label: 'Upsell' },
]

export function buildResumenAccionables(items) {
  const count = (cat) => items.filter((item) => (item.categoria || item.tipo) === cat).length
  return {
    total: items.length,
    win: count('win'),
    upsell: count('upsell'),
  }
}
