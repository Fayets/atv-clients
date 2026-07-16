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

export function fetchAnalisis() {
  return request('/api/analisis')
}

export function patchAnalisis(data) {
  return request('/api/analisis', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}
