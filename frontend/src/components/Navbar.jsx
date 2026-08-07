import { useEffect, useState } from 'react'
import { navigate } from '../utils/navigation'
import { applyTheme, getStoredTheme, toggleTheme } from '../utils/theme'
import styles from './Navbar.module.css'

export default function Navbar({ currentPath }) {
  const [theme, setTheme] = useState(() => getStoredTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const links = [
    { href: '/', label: 'Inicio' },
    { href: '/cobranza', label: 'Cobranza' },
    { href: '/clientes', label: 'Clientes' },
  ]

  const handleToggleTheme = () => {
    setTheme(toggleTheme())
  }

  const handleNavClick = (event, href) => {
    event.preventDefault()
    if (window.location.pathname !== href) {
      navigate(href)
    }
  }

  return (
    <nav className={styles.navbar}>
      <div className={styles.navLeft}>
        <a
          href="/"
          className={styles.brand}
          onClick={(event) => handleNavClick(event, '/')}
        >
          <img
            src="/ATVLogin.png"
            alt="ATV — Aumenta Tu Valor"
            className={styles.logo}
            width={32}
            height={32}
          />
          <span className={styles.brandText}>Clients</span>
        </a>
        <div className={styles.links}>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`${styles.link} ${currentPath === link.href ? styles.linkActive : ''}`}
              onClick={(event) => handleNavClick(event, link.href)}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
      <button
        type="button"
        className={styles.themeBtn}
        onClick={handleToggleTheme}
        aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      >
        <i className={`ti ${theme === 'dark' ? 'ti-sun' : 'ti-moon'}`} />
        {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      </button>
    </nav>
  )
}
