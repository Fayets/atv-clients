export function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function matchClienteRoute(pathname) {
  const match = pathname.match(/^\/cliente\/(\d+)$/)
  return match ? Number(match[1]) : null
}
