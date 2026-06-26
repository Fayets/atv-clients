const STORAGE_KEY = 'atv-clients-theme'

export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // ignore
  }
  return 'dark'
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}

export function initTheme() {
  applyTheme(getStoredTheme())
}

export function toggleTheme() {
  const next = getStoredTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
