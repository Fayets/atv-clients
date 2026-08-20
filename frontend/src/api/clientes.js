async function readErrorDetail(res) {
  if (res.status === 413) {
    return 'El archivo es demasiado grande para el servidor (máx. ~8 MB en comprobantes, ~5 MB en transcripts). Probá con uno más liviano.'
  }
  let detail = `Error de servidor (${res.status})`
  try {
    const body = await res.json()
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail
    }
    if (Array.isArray(body.detail) && body.detail.length) {
      return body.detail.map((item) => item.msg || JSON.stringify(item)).join(' · ')
    }
    if (body.detail != null) {
      return String(body.detail)
    }
  } catch {
    // ignore parse errors
  }
  if (!res.status || res.status >= 502) {
    return 'No se pudo conectar con el servidor. ¿Está corriendo el backend?'
  }
  return detail
}

async function request(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!res.ok) {
    throw new Error(await readErrorDetail(res))
  }

  if (res.status === 204) return null
  return res.json()
}

async function requestText(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    ...options,
  })

  if (!res.ok) {
    throw new Error(await readErrorDetail(res))
  }

  return res.text()
}

export function createCliente(data) {
  return request('/api/clientes', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function fetchClientes(params = {}) {
  const query = new URLSearchParams()
  if (params.estado) query.set('estado', params.estado)
  if (params.plan) query.set('plan', params.plan)
  if (params.q) query.set('q', params.q)
  if (params.orden) query.set('orden', params.orden)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request(`/api/clientes${suffix}`)
}

export function fetchDashboard({ mes, anio, semana } = {}) {
  const query = new URLSearchParams()
  if (mes) query.set('mes', String(mes))
  if (anio) query.set('anio', String(anio))
  if (semana) query.set('semana', semana)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request(`/api/clientes/dashboard${suffix}`)
}

export function fetchCliente(id) {
  return request(`/api/clientes/${id}`)
}

export function patchCliente(id, data) {
  return request(`/api/clientes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteCliente(id) {
  return request(`/api/clientes/${id}`, {
    method: 'DELETE',
  })
}

export function migrarCliente(origenId, destinoId) {
  return request('/api/clientes/migrar', {
    method: 'POST',
    body: JSON.stringify({ origen_id: origenId, destino_id: destinoId }),
  })
}

export function pagarCuota(clienteId, cuotaId) {
  return request(`/api/clientes/${clienteId}/cuotas/${cuotaId}/pagar`, {
    method: 'POST',
  })
}

export function createCuota(clienteId, data) {
  return request(`/api/clientes/${clienteId}/cuotas`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function patchCuota(clienteId, cuotaId, data) {
  return request(`/api/clientes/${clienteId}/cuotas/${cuotaId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteCuota(clienteId, cuotaId) {
  return request(`/api/clientes/${clienteId}/cuotas/${cuotaId}`, {
    method: 'DELETE',
  })
}

export function createObservacion(clienteId, data) {
  return request(`/api/clientes/${clienteId}/observaciones`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function deleteObservacion(clienteId, observacionId) {
  return request(`/api/clientes/${clienteId}/observaciones/${observacionId}`, {
    method: 'DELETE',
  })
}

export function fetchProximosPasos(clienteId) {
  return request(`/api/clientes/${clienteId}/proximos-pasos`)
}

export function createProximosPasos(clienteId, data) {
  return request(`/api/clientes/${clienteId}/proximos-pasos`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function patchProximosPasos(clienteId, pasoId, data) {
  return request(`/api/clientes/${clienteId}/proximos-pasos/${pasoId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteProximosPasos(clienteId, pasoId) {
  return request(`/api/clientes/${clienteId}/proximos-pasos/${pasoId}`, {
    method: 'DELETE',
  })
}

export function createMiroBoard(clienteId, data) {
  return request(`/api/clientes/${clienteId}/miros`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function patchMiroBoard(clienteId, miroId, data) {
  return request(`/api/clientes/${clienteId}/miros/${miroId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteMiroBoard(clienteId, miroId) {
  return request(`/api/clientes/${clienteId}/miros/${miroId}`, {
    method: 'DELETE',
  })
}

export function createFathomBoard(clienteId, data) {
  return request(`/api/clientes/${clienteId}/fathoms`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function patchFathomBoard(clienteId, fathomId, data) {
  return request(`/api/clientes/${clienteId}/fathoms/${fathomId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteFathomBoard(clienteId, fathomId) {
  return request(`/api/clientes/${clienteId}/fathoms/${fathomId}`, {
    method: 'DELETE',
  })
}

async function uploadRequest(path, formData) {
  let res
  try {
    res = await fetch(path, {
      credentials: 'include',
      body: formData,
      method: 'POST',
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor. ¿Está corriendo el backend?')
  }

  if (!res.ok) {
    throw new Error(await readErrorDetail(res))
  }

  return res.json()
}

export function uploadCuotaComprobante(clienteId, cuotaId, formData) {
  return uploadRequest(`/api/clientes/${clienteId}/cuotas/${cuotaId}/comprobantes`, formData)
}

export function cuotaComprobanteUrl(clienteId, cuotaId, comprobanteId) {
  return `/api/clientes/${clienteId}/cuotas/${cuotaId}/comprobantes/${comprobanteId}`
}

export function deleteCuotaComprobante(clienteId, cuotaId, comprobanteId) {
  return request(`/api/clientes/${clienteId}/cuotas/${cuotaId}/comprobantes/${comprobanteId}`, {
    method: 'DELETE',
  })
}

export function uploadDiscordTranscript(clienteId, formData) {
  return uploadRequest(`/api/clientes/${clienteId}/discord-transcripts`, formData)
}

export function patchDiscordTranscript(clienteId, transcriptId, data) {
  return request(`/api/clientes/${clienteId}/discord-transcripts/${transcriptId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteDiscordTranscript(clienteId, transcriptId) {
  return request(`/api/clientes/${clienteId}/discord-transcripts/${transcriptId}`, {
    method: 'DELETE',
  })
}

export function discordTranscriptDownloadUrl(clienteId, transcriptId) {
  return `/api/clientes/${clienteId}/discord-transcripts/${transcriptId}/download`
}

export function createDocumentoLink(clienteId, data) {
  return request(`/api/clientes/${clienteId}/documentos`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function patchDocumentoLink(clienteId, linkId, data) {
  return request(`/api/clientes/${clienteId}/documentos/${linkId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteDocumentoLink(clienteId, linkId) {
  return request(`/api/clientes/${clienteId}/documentos/${linkId}`, {
    method: 'DELETE',
  })
}

export function fetchDiscordTranscriptsBot(clienteId) {
  return request(`/api/discord/${clienteId}/transcripts`)
}

export function fetchDiscordTranscriptContenido(clienteId, transcriptId) {
  return requestText(`/api/discord/${clienteId}/transcripts/${transcriptId}/contenido`)
}

export function fetchDiscordEstado(clienteId) {
  return request(`/api/discord/${clienteId}/estado`)
}

export function triggerDiscordActualizacion(clienteId) {
  return request(`/api/discord/${clienteId}/actualizar`, { method: 'POST' })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function triggerDiscordActualizacionTodos(onProgress) {
  const started = await request('/api/discord/actualizar-todos', { method: 'POST' })
  if (started?.status === 'done' && started.result) {
    return started.result
  }
  if (started?.status === 'error') {
    throw new Error(started.error || 'Error al sincronizar Discord')
  }

  const startedAt = Date.now()
  const maxWaitMs = 15 * 60 * 1000
  while (Date.now() - startedAt < maxWaitMs) {
    await sleep(2000)
    const state = await request('/api/discord/actualizar-todos/estado')
    if (typeof onProgress === 'function' && state.canales_procesados != null) {
      onProgress(state.canales_procesados)
    }
    if (state.status === 'done') {
      return state.result
    }
    if (state.status === 'error') {
      throw new Error(state.error || 'Error al sincronizar Discord')
    }
  }
  throw new Error('La sincronización está tardando demasiado. Recargá en unos minutos.')
}

export function crearDiscordFaltantes(canales = null) {
  return request('/api/discord/crear-faltantes', {
    method: 'POST',
    body: JSON.stringify(canales?.length ? { canales } : {}),
  })
}
