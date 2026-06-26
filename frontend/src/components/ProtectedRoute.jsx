import { useEffect, useState } from 'react'
import { getSession, isMockAuth } from '../api/auth'
import styles from './ProtectedRoute.module.css'

export default function ProtectedRoute({ children }) {
  const [status, setStatus] = useState(() => (isMockAuth() ? 'authenticated' : 'loading'))

  useEffect(() => {
    if (isMockAuth()) return

    getSession().then((session) => {
      if (session !== null && session.username) {
        setStatus('authenticated')
      } else {
        window.location.replace('https://ecosystem.atvos.io')
      }
    })
  }, [])

  if (status === 'loading') {
    return (
      <div className={styles.screen}>
        <img
          src="/ATVLogin.png"
          alt="ATV — Aumenta Tu Valor"
          className={styles.logo}
          width={64}
          height={64}
        />
      </div>
    )
  }

  return children
}
