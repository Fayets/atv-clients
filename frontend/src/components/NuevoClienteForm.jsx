import { useState } from 'react'
import { createCliente } from '../api/clientes'
import { MESES_DURACION, PLANES_CLIENTE } from '../constants/options'
import {
  calcFechaVencimiento,
  formatDate,
  monthsToDays,
  resolveDuracionMeses,
  todayLocalISO,
} from '../utils/format'
import styles from './NuevoClienteForm.module.css'

function buildFormState(overrides = {}) {
  const fecha_inicio = overrides.fecha_inicio ?? todayLocalISO()
  const plan_actual = overrides.plan_actual ?? 'mentoria'
  const duracion_meses = overrides.duracion_meses ?? ''
  return {
    nombre: '',
    email: '',
    plan_actual,
    fecha_inicio,
    duracion_meses,
    fecha_vencimiento: calcFechaVencimiento(fecha_inicio, plan_actual, duracion_meses),
    total_pagado_usd: '',
    total_adeudado_usd: '',
    observaciones: '',
    ...overrides,
  }
}

export default function NuevoClienteForm({ onCreated, onCancel }) {
  const [form, setForm] = useState(() => buildFormState())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'fecha_inicio' || field === 'duracion_meses' || field === 'plan_actual') {
        next.fecha_vencimiento = calcFechaVencimiento(
          next.fecha_inicio,
          next.plan_actual,
          next.duracion_meses,
        )
      }
      return next
    })
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.nombre.trim() || !form.email.trim()) {
      setError('Nombre y email son obligatorios.')
      return
    }

    const meses = resolveDuracionMeses(form.plan_actual, form.duracion_meses)
    const fecha_vencimiento = calcFechaVencimiento(form.fecha_inicio, form.plan_actual, form.duracion_meses)

    if (!form.fecha_inicio || !meses || !fecha_vencimiento) {
      setError('Completá la fecha de inicio y la duración para calcular el vencimiento.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const payload = {
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        plan_actual: form.plan_actual,
        fecha_inicio: form.fecha_inicio,
        duracion_dias: monthsToDays(meses),
        fecha_vencimiento,
      }
      if (form.total_pagado_usd !== '') payload.total_pagado_usd = Number(form.total_pagado_usd)
      if (form.total_adeudado_usd !== '') payload.total_adeudado_usd = Number(form.total_adeudado_usd)
      if (form.observaciones.trim()) payload.observaciones = form.observaciones.trim()

      const created = await createCliente(payload)
      setForm(buildFormState())
      onCreated(created)
    } catch (err) {
      setError(err.message || 'No se pudo crear el cliente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <div className={styles.header}>
        <h2 className={styles.title}>Nuevo cliente</h2>
        <button type="button" className={styles.closeBtn} onClick={onCancel} aria-label="Cerrar">
          <i className="ti ti-x" />
        </button>
      </div>

      <div className={styles.grid}>
        <label className={styles.field}>
          <span className={styles.label}>Nombre *</span>
          <input
            className={styles.input}
            value={form.nombre}
            onChange={(event) => update('nombre', event.target.value)}
            placeholder="Nombre completo"
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Email *</span>
          <input
            type="email"
            className={styles.input}
            value={form.email}
            onChange={(event) => update('email', event.target.value)}
            placeholder="email@ejemplo.com"
            required
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Plan *</span>
          <select
            className={styles.input}
            value={form.plan_actual}
            onChange={(event) => update('plan_actual', event.target.value)}
          >
            {PLANES_CLIENTE.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Fecha inicio</span>
          <input
            type="date"
            className={styles.input}
            value={form.fecha_inicio}
            onChange={(event) => update('fecha_inicio', event.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Duración (meses)</span>
          <select
            className={styles.input}
            value={form.duracion_meses}
            onChange={(event) => update('duracion_meses', event.target.value)}
          >
            <option value="">Auto según plan</option>
            {MESES_DURACION.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Fecha vencimiento</span>
          <input
            type="text"
            className={`${styles.input} ${styles.readonly}`}
            value={form.fecha_vencimiento ? formatDate(form.fecha_vencimiento) : '—'}
            readOnly
            tabIndex={-1}
          />
          <span className={styles.hint}>Calculada automáticamente</span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Total pagado USD</span>
          <input
            type="number"
            step="0.01"
            className={styles.input}
            value={form.total_pagado_usd}
            onChange={(event) => update('total_pagado_usd', event.target.value)}
            placeholder="0"
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Total adeudado USD</span>
          <input
            type="number"
            step="0.01"
            className={styles.input}
            value={form.total_adeudado_usd}
            onChange={(event) => update('total_adeudado_usd', event.target.value)}
            placeholder="0"
          />
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.label}>Observaciones</span>
          <textarea
            className={styles.textarea}
            value={form.observaciones}
            onChange={(event) => update('observaciones', event.target.value)}
            rows={3}
            placeholder="Notas iniciales..."
          />
        </label>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {saving ? 'Creando...' : 'Crear cliente'}
        </button>
      </div>
    </form>
  )
}
