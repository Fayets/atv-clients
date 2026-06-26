const ECOSYSTEM_API = import.meta.env.VITE_ECOSYSTEM_API_URL || 'https://ecosystem.atvos.io'
const MOCK_AUTH = import.meta.env.VITE_MOCK_AUTH === 'true'

const MOCK_SESSION = {
  id: 1,
  nombre: 'Franco',
  email: 'franco@atv.com',
}

export async function getSession() {
  if (MOCK_AUTH) {
    return MOCK_SESSION
  }

  try {
    const res = await fetch(`${ECOSYSTEM_API}/api/auth/session`, {
      credentials: 'include',
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export function isMockAuth() {
  return MOCK_AUTH
}
