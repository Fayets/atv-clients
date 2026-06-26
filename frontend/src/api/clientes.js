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
    let detail = 'Error de servidor'
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      // ignore parse errors
    }
    throw new Error(detail)
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
    let detail = 'Error de servidor'
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      // ignore parse errors
    }
    throw new Error(detail)
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

export function fetchCobranza() {
  return request('/api/clientes/cobranza')
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
  const res = await fetch(path, {
    credentials: 'include',
    body: formData,
    method: 'POST',
  })

  if (!res.ok) {
    let detail = 'Error de servidor'
    try {
      const body = await res.json()
      detail = body.detail || detail
    } catch {
      // ignore parse errors
    }
    throw new Error(detail)
  }

  return res.json()
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
