import { useEffect, useState } from 'react'
import { fetchCobranza } from '../api/clientes'
import Navbar from '../components/Navbar'
import StatusBadge from '../components/StatusBadge'
import { labelTipoCuotaNota } from '../constants/options'
import { formatDate, formatUsd } from '../utils/format'
import { navigate } from '../utils/navigation'
import styles from './CobranzaPage.module.css'

const TIPO_CLASS = {
  cuota: 'tagCuota',
  recompra: 'tagRecompra',
  upsell: 'tagUpsell',
}

export default function CobranzaPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const data = await fetchCobranza()
        if (!cancelled) setItems(data)
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className={styles.page}>
      <Navbar currentPath="/cobranza" />

      <main className={styles.content}>
        <header className={styles.header}>
          <h1 className={styles.title}>Cobranza</h1>
          <p className={styles.subtitle}>Clientes con deuda o vencimiento próximo/inmediato</p>
        </header>

        <section className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Monto</th>
                  <th>Vence</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className={styles.cellMuted}>Cargando...</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.cellMuted}>No hay clientes en cobranza</td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const tipo = item.proxima_cuota?.tipo || null
                    return (
                      <tr
                        key={item.id}
                        className={styles.rowClickable}
                        onClick={() => navigate(`/cliente/${item.id}`)}
                      >
                        <td className={styles.cellName}>{item.nombre}</td>
                        <td>
                          {tipo ? (
                            <span className={`${styles.tag} ${styles[TIPO_CLASS[tipo] || 'tagCuota']}`}>
                              {labelTipoCuotaNota(tipo)}
                            </span>
                          ) : (
                            <span className={styles.cellMuted}>—</span>
                          )}
                        </td>
                        <td><StatusBadge estado={item.estado_efectivo} /></td>
                        <td className={styles.cellMoney}>
                          {item.proxima_cuota ? formatUsd(item.proxima_cuota.monto_usd) : '—'}
                        </td>
                        <td className={styles.cellMuted}>
                          {item.proxima_cuota?.fecha_vence
                            ? formatDate(item.proxima_cuota.fecha_vence)
                            : '—'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
