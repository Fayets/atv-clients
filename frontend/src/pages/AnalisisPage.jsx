import { useEffect, useMemo, useState } from 'react'
import { fetchAnalisis, patchAnalisis } from '../api/analisis'
import { fetchClientes } from '../api/clientes'
import Navbar from '../components/Navbar'
import { formatDateTime, formatPlan, formatUsd } from '../utils/format'
import { navigate } from '../utils/navigation'
import styles from './AnalisisPage.module.css'

function buildDraft(data) {
  return {
    total_usd: data?.total_usd != null ? String(data.total_usd) : '',
    periodo: data?.periodo || '',
    titulo: data?.titulo || '',
    subtitulo: data?.subtitulo || '',
    historia: data?.historia || '',
    fuentes: data?.fuentes || '',
  }
}

function buildClientMetrics(clientes) {
  const byPlan = { boost: 0, mentoria: 0, advantage: 0 }
  let activos = 0
  let vigentes = 0
  let proximos = 0
  let vencidos = 0
  let inactivos = 0
  let totalPagado = 0
  let totalAdeudado = 0
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)

  let nuevos90 = 0

  for (const cliente of clientes) {
    const estado = cliente.estado_efectivo || cliente.estado_cliente
    totalPagado += Number(cliente.total_pagado_usd || 0)
    totalAdeudado += Number(cliente.total_adeudado_usd || 0)

    if (estado === 'inactivo') {
      inactivos += 1
    } else {
      activos += 1
      if (byPlan[cliente.plan_actual] !== undefined) {
        byPlan[cliente.plan_actual] += 1
      }
    }

    if (estado === 'vigente' || estado === 'estan_bien') vigentes += 1
    if (estado === 'proximo_a_vencer') proximos += 1
    if (estado === 'vencido') vencidos += 1

    if (cliente.fecha_inicio) {
      const inicio = new Date(`${cliente.fecha_inicio}T00:00:00`)
      if (inicio >= cutoff) nuevos90 += 1
    }
  }

  return {
    total: clientes.length,
    activos,
    vigentes,
    proximos,
    vencidos,
    inactivos,
    byPlan,
    totalPagado,
    totalAdeudado,
    nuevos90,
  }
}

export default function AnalisisPage() {
  const [data, setData] = useState(null)
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(buildDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const metrics = useMemo(() => buildClientMetrics(clientes), [clientes])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [analisis, lista] = await Promise.all([fetchAnalisis(), fetchClientes()])
      setData(analisis)
      setDraft(buildDraft(analisis))
      setClientes(lista)
    } catch (err) {
      setError(err.message || 'No se pudo cargar el análisis.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openEdit = () => {
    setDraft(buildDraft(data))
    setEditing(true)
    setError('')
  }

  const cancelEdit = () => {
    setDraft(buildDraft(data))
    setEditing(false)
    setError('')
  }

  const save = async (event) => {
    event.preventDefault()
    const total = Number(String(draft.total_usd).replace(',', '.'))
    if (!Number.isFinite(total) || total < 0) {
      setError('Ingresá un monto válido en USD.')
      return
    }
    if (!draft.titulo.trim() || !draft.periodo.trim()) {
      setError('Título y período son obligatorios.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const updated = await patchAnalisis({
        total_usd: total,
        periodo: draft.periodo.trim(),
        titulo: draft.titulo.trim(),
        subtitulo: draft.subtitulo.trim(),
        historia: draft.historia.trim(),
        fuentes: draft.fuentes.trim(),
      })
      setData(updated)
      setDraft(buildDraft(updated))
      setEditing(false)
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const fuentes = (data?.fuentes || '')
    .split('·')
    .map((item) => item.trim())
    .filter(Boolean)

  const planRows = [
    { key: 'boost', label: formatPlan('boost'), value: metrics.byPlan.boost, tone: styles.planBoost },
    { key: 'mentoria', label: formatPlan('mentoria'), value: metrics.byPlan.mentoria, tone: styles.planMentoria },
    { key: 'advantage', label: formatPlan('advantage'), value: metrics.byPlan.advantage, tone: styles.planAdvantage },
  ]
  const planMax = Math.max(1, ...planRows.map((row) => row.value))

  return (
    <div className={styles.page}>
      <Navbar currentPath="/analisis" />

      <main className={styles.stage}>
        <div className={styles.topBar}>
          <div>
            <button type="button" className={styles.backBtn} onClick={() => navigate('/')}>
              ← Volver a clientes
            </button>
            <h1 className={styles.pageTitle}>Análisis</h1>
            <p className={styles.pageSubtitle}>Métricas de cartera y resultados de clientes</p>
          </div>
          {!editing && data ? (
            <button type="button" className={styles.editBtn} onClick={openEdit}>
              <i className="ti ti-pencil" />
              Editar cash collected
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className={styles.status}>Cargando métricas...</p>
        ) : error && !data ? (
          <p className={styles.statusError}>{error}</p>
        ) : editing ? (
          <form className={styles.editCard} onSubmit={save}>
            <h2 className={styles.editTitle}>Actualizar cash collected</h2>
            <div className={styles.editGrid}>
              <label className={styles.field}>
                <span className={styles.label}>Título</span>
                <input
                  className={styles.input}
                  value={draft.titulo}
                  onChange={(event) => setDraft((prev) => ({ ...prev, titulo: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Período</span>
                <input
                  className={styles.input}
                  value={draft.periodo}
                  onChange={(event) => setDraft((prev) => ({ ...prev, periodo: event.target.value }))}
                  placeholder="Últimos 3 meses"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Total USD</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={styles.input}
                  value={draft.total_usd}
                  onChange={(event) => setDraft((prev) => ({ ...prev, total_usd: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Subtítulo</span>
                <input
                  className={styles.input}
                  value={draft.subtitulo}
                  onChange={(event) => setDraft((prev) => ({ ...prev, subtitulo: event.target.value }))}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.label}>Historia</span>
                <textarea
                  className={styles.textarea}
                  rows={5}
                  value={draft.historia}
                  onChange={(event) => setDraft((prev) => ({ ...prev, historia: event.target.value }))}
                />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span className={styles.label}>Fuentes (separadas por ·)</span>
                <input
                  className={styles.input}
                  value={draft.fuentes}
                  onChange={(event) => setDraft((prev) => ({ ...prev, fuentes: event.target.value }))}
                  placeholder="Canal de wins · Canales privados"
                />
              </label>
            </div>
            {error ? <p className={styles.statusError}>{error}</p> : null}
            <div className={styles.editActions}>
              <button type="button" className={styles.cancelBtn} onClick={cancelEdit} disabled={saving}>
                Cancelar
              </button>
              <button type="submit" className={styles.saveBtn} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        ) : data ? (
          <>
            <section className={styles.heroCard}>
              <article className={styles.cashMetric}>
                <div className={styles.metricHead}>
                  <span className={styles.metricLabel}>{data.titulo || 'Cash collected'}</span>
                  <i className="ti ti-currency-dollar" />
                </div>
                <div className={styles.cashValue}>{formatUsd(data.total_usd)}</div>
                <div className={styles.cashMetaRow}>
                  <span className={styles.cashPeriod}>{data.periodo}</span>
                  <span className={styles.cashDivider}>·</span>
                  <span className={styles.cashHint}>
                    {formatUsd(metrics.activos ? Number(data.total_usd) / metrics.activos : 0)} / cliente activo
                  </span>
                </div>
                {data.subtitulo ? <p className={styles.cashSub}>{data.subtitulo}</p> : null}
                {data.historia ? <p className={styles.cashNote}>{data.historia}</p> : null}
                {fuentes.length ? (
                  <div className={styles.cashSources}>
                    {fuentes.map((fuente) => (
                      <span key={fuente} className={styles.sourceChip}>{fuente}</span>
                    ))}
                  </div>
                ) : null}
              </article>
              <div className={styles.heroSide}>
                <div className={styles.heroStat}>
                  <span className={styles.heroStatLabel}>Clientes activos</span>
                  <strong className={styles.heroStatValue}>{metrics.activos}</strong>
                </div>
                <div className={styles.heroStat}>
                  <span className={styles.heroStatLabel}>Alta últimos 90 días</span>
                  <strong className={styles.heroStatValue}>{metrics.nuevos90}</strong>
                </div>
                <div className={styles.heroStat}>
                  <span className={styles.heroStatLabel}>Total en cartera</span>
                  <strong className={styles.heroStatValue}>{metrics.total}</strong>
                </div>
              </div>
            </section>

            <section className={styles.metricsGrid}>
              <article className={`${styles.metricCard} ${styles.metricPulse}`}>
                <div className={styles.metricHead}>
                  <span className={styles.metricLabel}>Vigentes</span>
                  <i className="ti ti-circle-check" />
                </div>
                <div className={styles.metricNum}>{metrics.vigentes}</div>
                <p className={styles.metricHint}>Operando dentro del programa</p>
              </article>
              <article className={`${styles.metricCard} ${styles.metricWarn}`}>
                <div className={styles.metricHead}>
                  <span className={styles.metricLabel}>Próximos a vencer</span>
                  <i className="ti ti-clock" />
                </div>
                <div className={`${styles.metricNum} ${styles.metricNumAccent}`}>{metrics.proximos}</div>
                <p className={styles.metricHint}>Ventana de 30 días</p>
              </article>
              <article className={styles.metricCard}>
                <div className={styles.metricHead}>
                  <span className={styles.metricLabel}>Vencidos</span>
                  <i className="ti ti-alert-triangle" />
                </div>
                <div className={styles.metricNum}>{metrics.vencidos}</div>
                <p className={styles.metricHint}>Oportunidad de recompra / follow-up</p>
              </article>
              <article className={styles.metricCard}>
                <div className={styles.metricHead}>
                  <span className={styles.metricLabel}>Inactivos</span>
                  <i className="ti ti-user-off" />
                </div>
                <div className={styles.metricNum}>{metrics.inactivos}</div>
                <p className={styles.metricHint}>Fuera del pipeline activo</p>
              </article>
            </section>

            <section className={styles.splitGrid}>
              <article className={styles.panel}>
                <div className={styles.panelHead}>
                  <h3 className={styles.panelTitle}>Mix por plan</h3>
                  <span className={styles.panelMeta}>{metrics.activos} activos</span>
                </div>
                <div className={styles.planList}>
                  {planRows.map((row) => (
                    <div key={row.key} className={styles.planRow}>
                      <div className={styles.planMeta}>
                        <span className={`${styles.planName} ${row.tone}`}>{row.label}</span>
                        <strong className={styles.planValue}>{row.value}</strong>
                      </div>
                      <div className={styles.planTrack}>
                        <div
                          className={`${styles.planFill} ${row.tone}`}
                          style={{ width: `${Math.round((row.value / planMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHead}>
                  <h3 className={styles.panelTitle}>Financiero interno</h3>
                  <span className={styles.panelMeta}>Desde cuotas / ficha</span>
                </div>
                <div className={styles.financeGrid}>
                  <div className={styles.financeItem}>
                    <span className={styles.financeLabel}>Total pagado</span>
                    <strong className={styles.financeValue}>{formatUsd(metrics.totalPagado)}</strong>
                  </div>
                  <div className={styles.financeItem}>
                    <span className={styles.financeLabel}>Total adeudado</span>
                    <strong className={styles.financeValue}>{formatUsd(metrics.totalAdeudado)}</strong>
                  </div>
                  <div className={styles.financeItem}>
                    <span className={styles.financeLabel}>Cash / cliente activo</span>
                    <strong className={styles.financeValue}>
                      {formatUsd(metrics.activos ? Number(data.total_usd) / metrics.activos : 0)}
                    </strong>
                  </div>
                  <div className={styles.financeItem}>
                    <span className={styles.financeLabel}>Alta reciente</span>
                    <strong className={styles.financeValue}>{metrics.nuevos90}</strong>
                  </div>
                </div>
              </article>
            </section>

            {data.updated_at ? (
              <p className={styles.meta}>
                Cash collected actualizado {formatDateTime(data.updated_at)}
                {data.updated_by ? ` · ${data.updated_by}` : ''}
                {' · '}Métricas de clientes en vivo
              </p>
            ) : (
              <p className={styles.meta}>Métricas de clientes en vivo desde la base</p>
            )}
          </>
        ) : null}
      </main>
    </div>
  )
}
