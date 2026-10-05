import { useEffect, useState } from 'react'
import { getSession, isMockAuth, unlockPanel } from '../api/auth'
import styles from './ProtectedRoute.module.css'

function Logo({ size = 64 }) {
  return (
    <img
      src="/ATVLogin.png"
      alt="ATV — Aumenta Tu Valor"
      className={styles.logo}
      width={size}
      height={size}
    />
  )
}

export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState(() => (isMockAuth() ? 'authenticated' : 'loading'))
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (isMockAuth()) return

    getSession().then((session) => {
      if (session === null || !session.username) {
        window.location.replace('https://ecosystem.atvos.io')
      } else if (session.unlocked) {
        setStatus('authenticated')
      } else {
        setStatus('locked')
      }
    })
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!password) return
    setChecking(true)
    setError('')
    const detail = await unlockPanel(password)
    setChecking(false)
    if (detail) {
      setError(detail)
      setPassword('')
      return
    }
    setStatus('authenticated')
  }

  if (status === 'loading') {
    return (
      <div className={styles.screen}>
        <Logo />
      </div>
    )
  }

  if (status === 'locked') {
    return (
      <div className={styles.screen}>
        <form className={styles.card} onSubmit={handleSubmit}>
          <Logo size={56} />
          <h1 className={styles.title}>ATV Clients</h1>
          <p className={styles.subtitle}>Ingresá la contraseña para entrar al panel.</p>
          <input
            type="password"
            className={styles.input}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setError('')
            }}
            placeholder="Contraseña"
            autoComplete="current-password"
            autoFocus
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <button type="submit" className={styles.button} disabled={checking || !password}>
            {checking ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
      </div>
    )
  }

  return children
}
