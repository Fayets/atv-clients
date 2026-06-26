const MOCK_AUTH = import.meta.env.VITE_MOCK_AUTH === 'true'

const MOCK_SESSION = {
  username: 'franco',
}

export async function getSession() {
  if (MOCK_AUTH) {
    return MOCK_SESSION
  }

  try {
    const res = await fetch('/api/auth/session', {
      credentials: 'include',
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data && typeof data.username === 'string' && data.username) {
      return data
    }
    return null
  } catch {
    return null
  }
}

export function isMockAuth() {
  return MOCK_AUTH
}
