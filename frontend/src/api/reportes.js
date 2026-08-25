/**
 * Reporte semanal — datos de ATV MKT.
 *
 * Va contra el backend de Clients, que es quien habla con ATV MKT y guarda
 * la API key. Nunca directo a MKT: el navegador no debe ver esa key, y un
 * proxy de Vite solo existiría en `npm run dev`.
 */

async function request(path) {
  let res
  try {
    res = await fetch(path, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor.')
  }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Sesión expirada. Recargá la página.')
    if (res.status === 404) throw new Error('El backend de Clients no tiene el endpoint de reportes (falta deployarlo).')
    let detail = `Error del servidor (${res.status})`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string' && body.detail.trim()) detail = body.detail
    } catch {
      // sin cuerpo JSON
    }
    throw new Error(detail)
  }
  const tipo = res.headers.get('content-type') || ''
  if (!tipo.includes('application/json')) {
    throw new Error('El servidor devolvió una página en vez de datos: el backend de Clients no está respondiendo /api/reportes.')
  }
  return res.json()
}

/**
 * Contenido publicado en [desde, hasta). Ambas fechas en YYYY-MM-DD;
 * `hasta` es exclusiva, así el viernes de cierre no cuenta en dos semanas.
 */
export function fetchContenido({ desde, hasta }) {
  const qs = new URLSearchParams({ desde, hasta })
  return request(`/api/reportes/contenido?${qs}`)
}

/** Llamadas de la semana con su atribución, estado y pago, más el funnel. */
export function fetchVentas({ desde, hasta }) {
  const qs = new URLSearchParams({ desde, hasta })
  return request(`/api/reportes/ventas?${qs}`)
}

/** Corre una semana comercial `dias` hacia adelante o atrás. */
export function correrSemana(desde, dias) {
  const d = new Date(`${desde}T12:00:00`)
  d.setDate(d.getDate() + dias)
  const fin = new Date(d)
  fin.setDate(d.getDate() + 7)
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { desde: iso(d), hasta: iso(fin) }
}

/** Etiqueta corta del rango, p. ej. "14/08 – 21/08". */
export function etiquetaSemana(desde, hasta) {
  const f = (iso) => {
    const d = new Date(`${iso}T12:00:00`)
    return `${d.getDate()}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return `${f(desde)} – ${f(hasta)}`
}

/** Viernes de la semana comercial que contiene a `fecha` (default: hoy). */
export function semanaComercial(fecha = new Date()) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  // 5 = viernes; retrocede hasta el viernes actual o el anterior
  const diff = (d.getDay() - 5 + 7) % 7
  const inicio = new Date(d)
  inicio.setDate(d.getDate() - diff)
  const fin = new Date(inicio)
  fin.setDate(inicio.getDate() + 7)
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { desde: iso(inicio), hasta: iso(fin) }
}
