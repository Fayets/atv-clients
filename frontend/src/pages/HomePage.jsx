import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchDashboard } from '../api/clientes'
import Navbar from '../components/Navbar'
import PlanBadge from '../components/PlanBadge'
import { formatUsd } from '../utils/format'
import { navigate } from '../utils/navigation'
import styles from './HomePage.module.css'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function monthOptions() {
  const hoy = new Date()
  const options = []
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    options.push({
      mes: d.getMonth() + 1,
      anio: d.getFullYear(),
      label: `${MESES[d.getMonth()]} ${d.getFullYear()}`,
    })
  }
  return options
}

const TAG_CLASS = {
  cuota: 'detailTagCuota',
  sena: 'detailTagSena',
  recompra: 'detailTagRecompra',
  upsell: 'detailTagUpsell',
  vencido: 'detailTagVencido',
  default: 'detailTagDefault',
}

function parseSubtitulo(subtitulo) {
  if (!subtitulo) return { tag: null, extra: null }
  const parts = subtitulo.split(' · ')
  if (parts.length >= 2) {
    return { tag: parts[0], extra: parts.slice(1).join(' · ') }
  }
  return { tag: subtitulo, extra: null }
}

function tagVariant(tag) {
  const t = tag.toLowerCase()
  if (t.includes('upsell')) return 'upsell'
  if (t.includes('recompra')) return 'recompra'
  if (t.includes('seña') || t.includes('sena')) return 'sena'
  if (t.startsWith('cuota')) return 'cuota'
  if (t.includes('vencido') || t.includes('vence')) return 'vencido'
  return 'default'
}

const SERIES = [
  { key: 'cuotas_usd', label: 'Cuotas', bar: 'barCuotas' },
  { key: 'upsell_usd', label: 'Upsell', bar: 'barUpsell' },
  { key: 'recompra_usd', label: 'Recompra', bar: 'barRecompra' },
]

function niceMax(value) {
  const n = Number(value) || 0
  if (n <= 0) return 1000
  const exp = 10 ** Math.floor(Math.log10(n))
  const nrm = n / exp
  const nice = nrm <= 1 ? 1 : nrm <= 2 ? 2 : nrm <= 5 ? 5 : 10
  return nice * exp
}

function shortMonthLabel(item) {
  const name = MESES[(item.mes || 1) - 1] || ''
  return `${name.slice(0, 3)} ${item.anio}`
}

function ProyeccionChart({ meses, loading }) {
  const rows = meses || []
  const peak = Math.max(
    0,
    ...rows.flatMap((item) => SERIES.map((serie) => Number(item[serie.key]) || 0)),
  )
  const max = niceMax(peak)
  const ticks = [max, max / 2, 0]

  return (
    <section className={styles.chartCard}>
      <div className={styles.chartHead}>
        <div>
          <h2 className={styles.chartTitle}>Próximos 6 meses</h2>
          <p className={styles.chartMeta}>Pendiente por vencer · cuotas, upsell y recompras</p>
        </div>
        <ul className={styles.chartLegend}>
          {SERIES.map((serie) => (
            <li key={serie.key}>
              <span className={`${styles.legendSwatch} ${styles[serie.bar]}`} />
              {serie.label}
            </li>
          ))}
        </ul>
      </div>
      {loading && !rows.length ? (
        <p className={styles.chartEmpty}>Cargando proyección…</p>
      ) : (
        <div className={styles.chartBody}>
          <div className={styles.chartYAxis} aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick}>{formatUsd(tick)}</span>
            ))}
          </div>
          <div className={styles.chartPlot}>
            <div className={styles.chartGrid} aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} className={styles.chartGridLine} />
              ))}
            </div>
            <div className={styles.chartGroups}>
              {rows.map((item) => (
                <div key={`${item.anio}-${item.mes}`} className={styles.chartGroup}>
                  <div className={styles.chartBars}>
                    {SERIES.map((serie) => {
                      const value = Number(item[serie.key]) || 0
                      const height = Math.max(0, (value / max) * 100)
                      return (
                        <div
                          key={serie.key}
                          className={styles.chartBarWrap}
                          title={`${serie.label}: ${formatUsd(value)}`}
                        >
                          <div
                            className={`${styles.chartBar} ${styles[serie.bar]}`}
                            style={{ height: `${height}%` }}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <span className={styles.chartMonth}>{shortMonthLabel(item)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function DetailPanel({ title, hint, items, onClose }) {
  return (
    <section className={styles.detailPanel}>
      <div className={styles.detailHead}>
        <div>
          <h2 className={styles.detailTitle}>{title}</h2>
          {hint ? <p className={styles.detailMeta}>{hint}</p> : null}
        </div>
        <button type="button" className={styles.detailClose} onClick={onClose}>
          <i className="ti ti-x" />
          Cerrar
        </button>
      </div>
      {items.length === 0 ? (
        <p className={styles.detailEmpty}>Sin registros.</p>
      ) : (
        <ul className={styles.detailList}>
          {items.map((item, index) => {
            const { tag, extra } = parseSubtitulo(item.subtitulo)
            const variant = tag ? tagVariant(tag) : 'default'
            return (
            <li
              key={`${item.cliente_id}-${item.subtitulo}-${index}`}
              className={styles.detailRow}
              onClick={() => navigate(`/cliente/${item.cliente_id}`)}
            >
              <div className={styles.detailRowMain}>
                <span className={styles.detailName}>{item.nombre}</span>
                {tag ? (
                  <div className={styles.detailTags}>
                    <span className={`${styles.detailTag} ${styles[TAG_CLASS[variant] || TAG_CLASS.default]}`}>
                      {tag}
                    </span>
                    {extra ? (
                      <span className={styles.detailTagExtra}>{extra}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <PlanBadge plan={item.plan_actual} />
              <span className={styles.detailAmount}>{formatUsd(item.monto_usd)}</span>
            </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default function HomePage() {
  const mesesDisponibles = useMemo(() => monthOptions(), [])
  const [mes, setMes] = useState(mesesDisponibles[0].mes)
  const [anio, setAnio] = useState(mesesDisponibles[0].anio)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchDashboard({ mes, anio })
      setData(result)
    } catch (err) {
      setData(null)
      setError(err.message || 'Error al cargar el dashboard')
    } finally {
      setLoading(false)
    }
  }, [mes, anio])

  useEffect(() => {
    load()
  }, [load])

  const resumen = data?.resumen
  const detalles = data?.detalles || {}

  const cards = [
    {
      id: 'cobrado',
      label: 'Caja 2 cobrado',
      value: resumen?.caja_2_cobrado_usd,
      sub: `Este mes · acumulado ${formatUsd(resumen?.caja_2_cobrado_total_usd ?? 0)}`,
      accent: styles.cardCobrado,
      big: true,
    },
    {
      id: 'cuotas',
      label: 'Cuotas a cobrar',
      value: resumen?.cuotas_a_cobrar_usd,
      sub: 'Caja 2 · pendiente del mes',
      accent: styles.cardCuotas,
    },
    {
      id: 'proyeccion',
      label: 'Proyección',
      value: resumen?.proyeccion_usd,
      sub: 'Upsell y recompras · no suma a cuotas a cobrar',
      accent: styles.cardProyeccion,
    },
    {
      id: 'total',
      label: 'Pendiente del mes',
      value: resumen?.total_mes_usd,
      sub: resumen?.caja_1_usd != null
        ? `Caja 1 ${formatUsd(resumen.caja_1_usd)} + Caja 2 ${formatUsd(resumen.caja_2_usd)}`
        : `Caja 2 ${formatUsd(resumen?.caja_2_usd ?? 0)} (Caja 1 pendiente)`,
      accent: styles.cardTotal,
    },
  ]

  const detailConfig = {
    cobrado: {
      title: `Caja 2 cobrado — ${resumen?.mes_label || ''}`,
      hint: `${detalles.cobrado?.length || 0} pagos · acumulado ${formatUsd(resumen?.caja_2_cobrado_total_usd ?? 0)}`,
      items: detalles.cobrado || [],
    },
    cuotas: {
      title: `Cuotas a cobrar — ${resumen?.mes_label || ''}`,
      hint: `${detalles.cuotas?.length || 0} cuotas · cargadas en ficha cliente`,
      items: detalles.cuotas || [],
    },
    proyeccion: {
      title: `Proyección — ${resumen?.mes_label || ''}`,
      hint: `${detalles.proyeccion?.length || 0} recompras y upsells · cargados en ficha cliente`,
      items: detalles.proyeccion || [],
    },
  }

  return (
    <div className={styles.page}>
      <Navbar currentPath="/" />

      <main className={styles.content}>
        <header className={styles.hero}>
          <div>
            <h1 className={styles.heroTitle}>Dashboard</h1>
            <p className={styles.heroSubtitle}>Cobrado · cuotas · proyección · total del mes</p>
          </div>
          <label className={styles.monthPicker}>
            <span>Mes</span>
            <select
              value={`${anio}-${mes}`}
              onChange={(e) => {
                const [y, m] = e.target.value.split('-').map(Number)
                setAnio(y)
                setMes(m)
                setSelected(null)
              }}
            >
              {mesesDisponibles.map((opt) => (
                <option key={`${opt.anio}-${opt.mes}`} value={`${opt.anio}-${opt.mes}`}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        <section className={styles.cardsGrid}>
          {cards.map((card) => {
            const active = selected === card.id
            const clickable = card.id !== 'total'
            return (
              <button
                key={card.id}
                type="button"
                disabled={!clickable}
                className={[
                  styles.card,
                  card.accent,
                  card.big ? styles.cardBig : '',
                  clickable ? styles.clickable : '',
                  active ? styles.cardActive : '',
                ].filter(Boolean).join(' ')}
                onClick={() => {
                  if (!clickable) return
                  setSelected((prev) => (prev === card.id ? null : card.id))
                }}
              >
                <span className={styles.cardLabel}>{card.label}</span>
                <span className={styles.cardValue}>
                  {loading ? '…' : formatUsd(card.value ?? 0)}
                </span>
                <span className={styles.cardSub}>{loading ? '…' : card.sub}</span>
                {clickable ? (
                  <span className={styles.cardHint}>
                    {active ? 'Ocultar detalle' : 'Ver detalle'}
                  </span>
                ) : null}
              </button>
            )
          })}
        </section>

        {selected && detailConfig[selected] ? (
          <DetailPanel
            title={detailConfig[selected].title}
            hint={detailConfig[selected].hint}
            items={detailConfig[selected].items}
            onClose={() => setSelected(null)}
          />
        ) : null}

        <ProyeccionChart meses={data?.proyeccion_meses} loading={loading} />
      </main>
    </div>
  )
}
