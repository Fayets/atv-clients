import { useCallback, useEffect, useMemo, useState } from 'react'
import { ejecutarAnalisisIA, fetchAnalisisIA } from '../api/analisis'
import AnalisisClienteCard from '../components/AnalisisClienteCard'
import AnalisisClienteChip from '../components/AnalisisClienteChip'
import Navbar from '../components/Navbar'
import {
  buildResumenAccionables,
  CATEGORIAS_FILTRO,
  filtrarAccionables,
} from '../utils/analisisIA'
import { formatDateTime } from '../utils/format'
import { navigate } from '../utils/navigation'
import styles from './AnalisisPage.module.css'

function applyEstado(data) {
  const todos = data?.clientes_analizados || data?.resultados || []
  const items = filtrarAccionables(data?.resultados || todos)
  return {
    items,
    clientesAnalizados: todos,
    ultimoAnalisis: data?.ultimo_analisis_en || null,
    proximoAnalisis: data?.proximo_analisis_en || null,
    intervaloDias: data?.intervalo_dias || 2,
    totalAnalizados: data?.total_analizados ?? todos.length,
    requierenAccion: data?.requieren_accion ?? items.length,
    enEjecucion: Boolean(data?.en_ejecucion),
    error: data?.error || '',
  }
}

export default function AnalisisPage() {
  const [error, setError] = useState('')
  const [iaItems, setIaItems] = useState([])
  const [clientesAnalizados, setClientesAnalizados] = useState([])
  const [iaFilter, setIaFilter] = useState('todos')
  const [ultimoAnalisis, setUltimoAnalisis] = useState(null)
  const [proximoAnalisis, setProximoAnalisis] = useState(null)
  const [intervaloDias, setIntervaloDias] = useState(2)
  const [totalAnalizados, setTotalAnalizados] = useState(0)
  const [requierenAccion, setRequierenAccion] = useState(0)
  const [enEjecucion, setEnEjecucion] = useState(false)
  const [loading, setLoading] = useState(true)

  const iaResumen = useMemo(() => buildResumenAccionables(iaItems), [iaItems])
  const iaFiltered = useMemo(() => {
    if (iaFilter === 'todos') return iaItems
    return iaItems.filter((item) => (item.categoria || item.tipo) === iaFilter)
  }, [iaFilter, iaItems])

  const applyToState = useCallback((estado) => {
    setIaItems(estado.items)
    setClientesAnalizados(estado.clientesAnalizados)
    setUltimoAnalisis(estado.ultimoAnalisis)
    setProximoAnalisis(estado.proximoAnalisis)
    setIntervaloDias(estado.intervaloDias)
    setTotalAnalizados(estado.totalAnalizados)
    setRequierenAccion(estado.requierenAccion)
    setEnEjecucion(estado.enEjecucion)
    if (estado.error) setError(estado.error)
    else setError('')
  }, [])

  const loadEstado = useCallback(async () => {
    try {
      const data = await fetchAnalisisIA()
      const estado = applyEstado(data)
      applyToState(estado)
      return estado
    } catch (err) {
      setError(err.message || 'No se pudo cargar el análisis.')
      return null
    }
  }, [applyToState])

  useEffect(() => {
    loadEstado().finally(() => setLoading(false))
  }, [loadEstado])

  useEffect(() => {
    if (!enEjecucion) return undefined
    const timer = setInterval(() => {
      loadEstado()
    }, 3000)
    return () => clearInterval(timer)
  }, [enEjecucion, loadEstado])

  const runAnalisisIA = async () => {
    setError('')
    setEnEjecucion(true)
    try {
      const data = await ejecutarAnalisisIA()
      applyToState(applyEstado(data))
    } catch (err) {
      setError(err.message || 'No se pudo analizar los transcripts.')
      setEnEjecucion(false)
    }
  }

  const analisisCompletoSinAccion = Boolean(
    ultimoAnalisis && !enEjecucion && !loading && iaItems.length === 0,
  )
  const mostrarClientes = Boolean(
    ultimoAnalisis && !enEjecucion && !loading && clientesAnalizados.length > 0,
  )

  return (
    <div className={styles.page}>
      <Navbar currentPath="/analisis" />

      <main className={styles.stage}>
        <div className={styles.topBar}>
          <div className={styles.topBarMain}>
            <button type="button" className={styles.backBtn} onClick={() => navigate('/clientes')}>
              ← Volver a clientes
            </button>
            <h1 className={styles.pageTitle}>Análisis</h1>
            <p className={styles.pageSubtitle}>
              Wins e upsells detectados en transcripts — ingresos generados y oportunidades de upgrade
            </p>
            <div className={styles.scheduleBar}>
              <span className={styles.scheduleItem}>
                <i className="ti ti-clock" />
                {ultimoAnalisis
                  ? `Último análisis: ${formatDateTime(ultimoAnalisis)}`
                  : 'Todavía no se ejecutó ningún análisis'}
              </span>
              {proximoAnalisis ? (
                <span className={styles.scheduleItem}>
                  <i className="ti ti-calendar-event" />
                  Próximo: {formatDateTime(proximoAnalisis)}
                </span>
              ) : null}
              {ultimoAnalisis ? (
                <span className={styles.scheduleItem}>
                  <i className="ti ti-users" />
                  {totalAnalizados} analizados · {requierenAccion} wins/upsells
                </span>
              ) : null}
              <span className={styles.scheduleBadge}>
                Automático cada {intervaloDias} días
              </span>
            </div>
          </div>
          <button
            type="button"
            className={styles.analyzeBtn}
            onClick={runAnalisisIA}
            disabled={enEjecucion || loading}
          >
            <i className={`ti ${enEjecucion ? 'ti-loader-2' : 'ti-sparkles'}`} />
            {enEjecucion ? 'Analizando transcripts...' : 'Analizar ahora'}
          </button>
        </div>

        {loading ? (
          <p className={styles.status}>Cargando análisis...</p>
        ) : null}

        {iaItems.length > 0 ? (
          <section className={styles.iaSummary}>
            <article className={styles.iaSummaryCard}>
              <span className={styles.iaSummaryLabel}>Total</span>
              <strong className={styles.iaSummaryValue}>{iaResumen.total}</strong>
            </article>
            <article className={`${styles.iaSummaryCard} ${styles.iaSummaryWin}`}>
              <span className={styles.iaSummaryLabel}>Win</span>
              <strong className={styles.iaSummaryValue}>{iaResumen.win}</strong>
            </article>
            <article className={`${styles.iaSummaryCard} ${styles.iaSummaryUpsell}`}>
              <span className={styles.iaSummaryLabel}>Upsell</span>
              <strong className={styles.iaSummaryValue}>{iaResumen.upsell}</strong>
            </article>
          </section>
        ) : null}

        {iaItems.length > 0 ? (
          <div className={styles.filterRow}>
            {CATEGORIAS_FILTRO.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${styles.filterChip} ${iaFilter === option.value ? styles.filterChipActive : ''}`}
                onClick={() => setIaFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {mostrarClientes ? (
          <section className={styles.clientesSection}>
            <div className={styles.clientesSectionHeader}>
              <h2 className={styles.clientesSectionTitle}>Clientes analizados</h2>
              <span className={styles.clientesSectionCount}>{clientesAnalizados.length}</span>
            </div>
            {analisisCompletoSinAccion ? (
              <p className={styles.clientesSectionHint}>
                Ninguno con win o upsell en este período — revisá cada ficha abajo.
              </p>
            ) : null}
            <div className={styles.clientesGrid}>
              {clientesAnalizados.map((item) => (
                <AnalisisClienteChip
                  key={item.id}
                  item={item}
                  onOpenCliente={(id) => navigate(`/cliente/${id}`)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {!loading && !ultimoAnalisis && !enEjecucion ? (
          <section className={styles.iaEmpty}>
            <div className={styles.iaEmptyIcon}>
              <i className="ti ti-message-chatbot" />
            </div>
            <h2 className={styles.iaEmptyTitle}>Wins y Upsells</h2>
            <p className={styles.iaEmptyText}>
              El bot analiza todos los transcripts de Discord y solo muestra clientes que
              generaron ingresos gracias al programa (Win) o están listos para un upgrade (Upsell).
            </p>
            <button type="button" className={styles.analyzeBtnLarge} onClick={runAnalisisIA}>
              <i className="ti ti-sparkles" />
              Ejecutar primer análisis
            </button>
          </section>
        ) : null}

        {enEjecucion ? (
          <section className={styles.iaLoading}>
            <i className="ti ti-loader-2" />
            <p>Leyendo transcripts y detectando wins y upsells...</p>
          </section>
        ) : null}

        {error ? <p className={styles.statusError}>{error}</p> : null}

        {iaFiltered.length > 0 && !enEjecucion ? (
          <section className={styles.iaList}>
            {iaFiltered.map((item, index) => (
              <div key={item.id} style={{ animationDelay: `${index * 60}ms` }}>
                <AnalisisClienteCard
                  item={item}
                  onOpenCliente={(id) => navigate(`/cliente/${id}`)}
                />
              </div>
            ))}
          </section>
        ) : null}
      </main>
    </div>
  )
}
