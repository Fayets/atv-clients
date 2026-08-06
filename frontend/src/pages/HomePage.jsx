import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchDashboard } from '../api/clientes'
import Navbar from '../components/Navbar'
import PlanBadge from '../components/PlanBadge'
import { formatUsd } from '../utils/format'
import { navigate } from '../utils/navigation'
import styles from './HomePage.module.css'

const CARD_CONFIG = {
  a_cobrar_mes: {
    title: 'A cobrar este mes',
    icon: 'ti-calendar-dollar',
    highlight: true,
  },
  vencido_acumulado: {
    title: 'Vencido acumulado',
    icon: 'ti-alert-triangle',
  },
  cobrado_mes: {
    title: 'Cobrado este mes',
    icon: 'ti-circle-check',
  },
  clientes_vigentes: {
    title: 'Clientes vigentes',
    icon: 'ti-heartbeat',
  },
  mes_anterior_impago: {
    title: 'Mes anterior impago',
    icon: 'ti-clock-exclamation',
    bucket: true,
  },
  mes_actual_pendiente: {
    title: 'Mes actual pendiente',
    icon: 'ti-calendar-event',
    bucket: true,
  },
  programas_riesgo: {
    title: 'Programas en riesgo',
    icon: 'ti-shield-x',
    bucket: true,
  },
}

function pctLabel(value) {
  if (value === null || value === undefined) return 'sin cuotas cargadas'
  return `${value}% cobrado`
}

function maxChartValue(items, keys) {
  return Math.max(
    1,
    ...items.flatMap((item) => keys.map((key) => Number(item[key] || 0))),
  )
}

function CardDetailPanel({ cardId, config, items, onClose }) {
  if (!cardId) return null

  return (
    <section className={styles.detailPanel}>
      <div className={styles.detailHead}>
        <div>
          <h2 className={styles.detailTitle}>{config.title}</h2>
          <p className={styles.detailMeta}>{items.length} registros</p>
        </div>
        <button type="button" className={styles.detailClose} onClick={onClose}>
          <i className="ti ti-x" />
          Cerrar
        </button>
      </div>
      {items.length === 0 ? (
        <p className={styles.detailEmpty}>No hay registros para mostrar.</p>
      ) : (
        <ul className={styles.detailList}>
          {items.map((item) => (
            <li
              key={`${cardId}-${item.cliente_id}`}
              className={styles.detailRow}
              onClick={() => navigate(`/cliente/${item.cliente_id}`)}
            >
              <div className={styles.detailRowMain}>
                <span className={styles.detailName}>{item.nombre}</span>
                {item.subtitulo ? (
                  <span className={styles.detailSub}>{item.subtitulo}</span>
                ) : null}
              </div>
              <PlanBadge plan={item.plan_actual} />
              <span className={styles.detailAmount}>{formatUsd(item.monto_usd)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function HomePage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCard, setSelectedCard] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchDashboard()
      setData(result)
    } catch (err) {
      setData(null)
      setError(err.message || 'Error al cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const kpis = data?.kpis
  const buckets = data?.buckets
  const graficos = data?.graficos
  const detalles = data?.detalles || {}

  const toggleCard = (id) => {
    setSelectedCard((prev) => (prev === id ? null : id))
  }

  const kpiCards = useMemo(() => [
    {
      id: 'a_cobrar_mes',
      value: formatUsd(kpis?.a_cobrar_mes_usd),
      sub: pctLabel(kpis?.mes_actual_pct),
      red: true,
      label: `A cobrar ${kpis?.mes_actual_label || 'este mes'}`,
    },
    {
      id: 'vencido_acumulado',
      value: formatUsd(kpis?.vencido_acumulado_usd),
      sub: 'Cuotas de meses anteriores sin pagar',
    },
    {
      id: 'cobrado_mes',
      value: formatUsd(kpis?.cobrado_mes_usd),
      sub: kpis?.mes_anterior_label
        ? `${kpis.mes_anterior_label}: ${pctLabel(kpis.mes_anterior_pct)}`
        : 'Mes anterior',
    },
    {
      id: 'clientes_vigentes',
      value: loading ? '…' : String(kpis?.clientes_vigentes ?? 0),
      sub: `${kpis?.total_clientes ?? 0} clientes en total`,
    },
  ], [kpis, loading])

  const bucketCards = useMemo(() => [
    { id: 'mes_anterior_impago', count: buckets?.mes_anterior_impago ?? 0 },
    { id: 'mes_actual_pendiente', count: buckets?.mes_actual_pendiente ?? 0 },
    { id: 'programas_riesgo', count: buckets?.programas_riesgo ?? 0 },
  ], [buckets])

  const cobranzaMax = maxChartValue(graficos?.cobranza_mensual || [], ['cobrado_usd', 'pendiente_usd'])
  const estadosMax = Math.max(1, ...(graficos?.estados_clientes || []).map((e) => e.count))
  const planMax = maxChartValue(graficos?.adeudo_por_plan || [], ['monto_usd'])

  const selectedConfig = selectedCard ? CARD_CONFIG[selectedCard] : null
  const selectedItems = selectedCard ? (detalles[selectedCard] || []) : []

  return (
    <div className={styles.page}>
      <Navbar currentPath="/" />

      <main className={styles.content}>
        <header className={styles.hero}>
          <div>
            <h1 className={styles.heroTitle}>Salud del negocio</h1>
            <p className={styles.heroSubtitle}>
              Cobranza, cartera activa y riesgo — tocá una tarjeta para ver el detalle
            </p>
          </div>
          <div className={styles.heroLinks}>
            <a href="/cobranza" className={styles.linkBtn}>
              <i className="ti ti-cash" />
              Cobranza
            </a>
            <a href="/clientes" className={styles.linkBtn}>
              <i className="ti ti-users" />
              Clientes
            </a>
          </div>
        </header>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        <section className={styles.metricsGrid}>
          {kpiCards.map((card) => {
            const cfg = CARD_CONFIG[card.id]
            const active = selectedCard === card.id
            return (
              <button
                key={card.id}
                type="button"
                className={[
                  styles.metricCard,
                  styles.clickableCard,
                  cfg.highlight ? styles.metricHighlight : '',
                  active ? styles.cardActive : '',
                ].filter(Boolean).join(' ')}
                onClick={() => toggleCard(card.id)}
              >
                <div className={styles.metricHead}>
                  <span className={styles.metricLabel}>{card.label || cfg.title}</span>
                  <i className={`ti ${cfg.icon}`} />
                </div>
                <div className={`${styles.metricNum} ${card.red ? styles.metricNumRed : ''}`}>
                  {loading ? '…' : card.value}
                </div>
                <div className={styles.metricSub}>{loading ? '…' : card.sub}</div>
                <span className={styles.cardHint}>{active ? 'Ocultar detalle' : 'Ver detalle'}</span>
              </button>
            )
          })}
        </section>

        <section className={styles.bucketsGrid}>
          {bucketCards.map((card) => {
            const cfg = CARD_CONFIG[card.id]
            const active = selectedCard === card.id
            return (
              <button
                key={card.id}
                type="button"
                className={[
                  styles.bucketCard,
                  styles.clickableCard,
                  active ? styles.cardActive : '',
                ].filter(Boolean).join(' ')}
                onClick={() => toggleCard(card.id)}
              >
                <div className={styles.bucketLabel}>{cfg.title}</div>
                <div className={`${styles.bucketNum} ${card.id === 'mes_anterior_impago' ? styles.metricNumRed : ''}`}>
                  {loading ? '…' : card.count}
                </div>
                <span className={styles.cardHint}>{active ? 'Ocultar detalle' : 'Ver detalle'}</span>
              </button>
            )
          })}
        </section>

        {selectedCard && selectedConfig ? (
          <CardDetailPanel
            cardId={selectedCard}
            config={selectedConfig}
            items={selectedItems}
            onClose={() => setSelectedCard(null)}
          />
        ) : null}

        <section className={styles.chartsGrid}>
          <article className={styles.chartCard}>
            <header className={styles.chartHead}>
              <h2 className={styles.chartTitle}>Cobranza mensual</h2>
              <span className={styles.chartLegend}>
                <span className={styles.legendDotOk} /> Cobrado
                <span className={styles.legendDotPending} /> Pendiente
              </span>
            </header>
            <div className={styles.barChart}>
              {(graficos?.cobranza_mensual || []).map((mes) => (
                <div key={mes.mes} className={styles.barGroup}>
                  <div className={styles.barStack}>
                    <div
                      className={styles.barOk}
                      style={{ height: `${(Number(mes.cobrado_usd) / cobranzaMax) * 100}%` }}
                      title={`Cobrado: ${formatUsd(mes.cobrado_usd)}`}
                    />
                    <div
                      className={styles.barPending}
                      style={{ height: `${(Number(mes.pendiente_usd) / cobranzaMax) * 100}%` }}
                      title={`Pendiente: ${formatUsd(mes.pendiente_usd)}`}
                    />
                  </div>
                  <span className={styles.barLabel}>{mes.mes.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHead}>
              <h2 className={styles.chartTitle}>Estado de la cartera</h2>
            </header>
            <div className={styles.hBarChart}>
              {(graficos?.estados_clientes || []).slice(0, 6).map((item) => (
                <div key={item.estado} className={styles.hBarRow}>
                  <span className={styles.hBarLabel}>{item.label}</span>
                  <div className={styles.hBarTrack}>
                    <div
                      className={styles.hBarFill}
                      style={{ width: `${(item.count / estadosMax) * 100}%` }}
                    />
                  </div>
                  <span className={styles.hBarValue}>{item.count}</span>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHead}>
              <h2 className={styles.chartTitle}>Adeudo por plan</h2>
            </header>
            <div className={styles.hBarChart}>
              {(graficos?.adeudo_por_plan || []).map((item) => (
                <div key={item.plan} className={styles.hBarRow}>
                  <span className={styles.hBarLabel}>
                    <PlanBadge plan={item.plan} />
                  </span>
                  <div className={styles.hBarTrack}>
                    <div
                      className={`${styles.hBarFill} ${styles.hBarFillRed}`}
                      style={{ width: `${(Number(item.monto_usd) / planMax) * 100}%` }}
                    />
                  </div>
                  <span className={styles.hBarValue}>{formatUsd(item.monto_usd)}</span>
                </div>
              ))}
              {!graficos?.adeudo_por_plan?.length && !loading ? (
                <p className={styles.detailEmpty}>Sin adeudo registrado por plan.</p>
              ) : null}
            </div>
          </article>
        </section>
      </main>
    </div>
  )
}
