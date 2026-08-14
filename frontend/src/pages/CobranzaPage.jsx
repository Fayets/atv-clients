import { useEffect, useState } from 'react'
import { fetchCobranza, patchCliente } from '../api/clientes'
import InlineField from '../components/InlineField'
import Navbar from '../components/Navbar'
import StatusBadge from '../components/StatusBadge'
import { PRIORIDADES, labelTipoCuotaNota } from '../constants/options'
import { formatPrioridad, formatUsd } from '../utils/format'
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

  const load = async () => {
    setLoading(true)
    try {
      const data = await fetchCobranza()
      setItems(data)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const updatePrioridad = async (id, value) => {
    const updated = await patchCliente(id, { prioridad_cobro: value || null })
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...updated } : item)))
  }

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
                  <th>Días</th>
                  <th>Adeudado</th>
                  <th>Prioridad</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className={styles.cellMuted}>Cargando...</td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.cellMuted}>No hay clientes en cobranza</td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const tipo = item.proxima_cuota?.tipo || null
                    return (
                      <tr
                        key={item.id}
                        className={item.prioridad_cobro === 'alta' ? styles.rowAlta : ''}
                      >
                        <td
                          className={`${styles.cellName} ${styles.cellLink}`}
                          onClick={() => navigate(`/cliente/${item.id}`)}
                        >
                          {item.nombre}
                        </td>
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
                        <td className={styles.cellMuted}>{item.dias_restantes ?? '—'}</td>
                        <td className={styles.cellMoney}>{formatUsd(item.total_adeudado_usd)}</td>
                        <td>
                          <InlineField
                            type="select"
                            variant="chip"
                            value={item.prioridad_cobro || ''}
                            displayValue={formatPrioridad(item.prioridad_cobro)}
                            options={PRIORIDADES}
                            onSave={(value) => updatePrioridad(item.id, value)}
                          />
                        </td>
                        <td className={styles.cellMoney}>
                          {item.proxima_cuota ? formatUsd(item.proxima_cuota.monto_usd) : '—'}
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
