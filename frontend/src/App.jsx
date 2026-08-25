import { useEffect, useState } from 'react'
import ProtectedRoute from './components/ProtectedRoute'
import ClientesPage from './pages/ClientesPage'
import ClientePage from './pages/ClientePage'
import HomePage from './pages/HomePage'
import MarketingPage from './pages/MarketingPage'
import VentasPage from './pages/VentasPage'
import { matchClienteRoute } from './utils/navigation'

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname)
    window.addEventListener('popstate', syncPath)
    return () => window.removeEventListener('popstate', syncPath)
  }, [])

  const clienteId = matchClienteRoute(path)

  let page
  if (clienteId) {
    page = <ClientePage clienteId={clienteId} />
  } else if (path === '/clientes') {
    page = <ClientesPage />
  } else if (path === '/marketing') {
    page = <MarketingPage />
  } else if (path === '/ventas') {
    page = <VentasPage />
  } else if (path === '/') {
    page = <HomePage />
  } else {
    window.location.replace('/')
    return null
  }

  return <ProtectedRoute>{page}</ProtectedRoute>
}
