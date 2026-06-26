import { useEffect, useState } from 'react'
import { fetchCobranza, pagarCuota, patchCliente } from '../api/clientes'
import InlineField from '../components/InlineField'
import Navbar from '../components/Navbar'
import StatusBadge from '../components/StatusBadge'
import { PRIORIDADES } from '../constants/options'
import { formatDate, formatPrioridad, formatUsd } from '../utils/format'
import { navigate } from '../utils/navigation'
import styles from './CobranzaPage.module.css'

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

  const marcarPagado = async (clienteId, cuotaId, event) => {
    event.stopPropagation()
    try {
      await pagarCuota(clienteId, cuotaId)
      await load()
    } catch {
      // mantener estado actual
    }
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
                  <th>Estado</th>
                  <th>Días</th>
                  <th>Adeudado</th>
                  <th>Prioridad</th>
                  <th>Próxima cuota</th>
                  <th />
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
                  items.map((item) => (
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
                      <td className={styles.cellMuted}>
                        {item.proxima_cuota
                          ? `${formatUsd(item.proxima_cuota.monto_usd)} · ${formatDate(item.proxima_cuota.fecha_vence)}`
                          : '—'}
                      </td>
                      <td>
                        {item.proxima_cuota ? (
                          <button
                            type="button"
                            className={styles.payBtn}
                            onClick={(event) => marcarPagado(item.id, item.proxima_cuota.id, event)}
                          >
                            <i className="ti ti-check" />
                            Marcar pagado
                          </button>
                        ) : (
                          <span className={styles.cellMuted}>—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
