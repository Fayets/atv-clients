import { useEffect, useState } from 'react'
import { fetchAnalisis, patchAnalisis } from '../api/analisis'
import Navbar from '../components/Navbar'
import { formatDateTime, formatUsd } from '../utils/format'
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

export default function AnalisisPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(buildDraft())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchAnalisis()
      setData(result)
      setDraft(buildDraft(result))
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

  return (
    <div className={styles.page}>
      <Navbar currentPath="/analisis" />

      <main className={styles.stage}>
        <div className={styles.topBar}>
          <button type="button" className={styles.backBtn} onClick={() => navigate('/')}>
            ← Volver a clientes
          </button>
          {!editing && data ? (
            <button type="button" className={styles.editBtn} onClick={openEdit}>
              <i className="ti ti-pencil" />
              Editar historia
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className={styles.status}>Cargando análisis...</p>
        ) : error && !data ? (
          <p className={styles.statusError}>{error}</p>
        ) : editing ? (
          <form className={styles.editCard} onSubmit={save}>
            <h2 className={styles.editTitle}>Actualizar historia</h2>
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
                {saving ? 'Guardando...' : 'Guardar historia'}
              </button>
            </div>
          </form>
        ) : data ? (
          <section className={styles.hero}>
            <p className={styles.brand}>ATV · Clients</p>
            <p className={styles.kicker}>{data.titulo}</p>
            <h1 className={styles.amount}>{formatUsd(data.total_usd)}</h1>
            <p className={styles.period}>{data.periodo}</p>
            <p className={styles.subtitle}>{data.subtitulo}</p>
            {data.historia ? <p className={styles.story}>{data.historia}</p> : null}
            {fuentes.length ? (
              <div className={styles.sources}>
                {fuentes.map((fuente) => (
                  <span key={fuente} className={styles.sourceChip}>{fuente}</span>
                ))}
              </div>
            ) : null}
            {data.updated_at ? (
              <p className={styles.meta}>
                Actualizado {formatDateTime(data.updated_at)}
                {data.updated_by ? ` · ${data.updated_by}` : ''}
              </p>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  )
}
