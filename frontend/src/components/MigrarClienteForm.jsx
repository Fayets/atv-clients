import { useMemo, useState } from 'react'
import { migrarCliente } from '../api/clientes'
import { formatUsd } from '../utils/format'
import styles from './NuevoClienteForm.module.css'

function clienteOptionLabel(cliente) {
  const plan = cliente.plan_actual || '—'
  const pagado = formatUsd(cliente.total_pagado_usd || 0)
  return `${cliente.nombre} · ${plan} · pagado ${pagado} · #${cliente.id}`
}

export default function MigrarClienteForm({ clientes, onMigrated, onCancel }) {
  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const sorted = useMemo(
    () => [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [clientes],
  )

  const origen = sorted.find((c) => String(c.id) === String(origenId))
  const destino = sorted.find((c) => String(c.id) === String(destinoId))

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!origenId || !destinoId) {
      setError('Elegí cliente origen y destino.')
      return
    }
    if (String(origenId) === String(destinoId)) {
      setError('Origen y destino deben ser distintos.')
      return
    }
    if (!confirmado) {
      setError('Confirmá que entendés que el origen se elimina.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const result = await migrarCliente(Number(origenId), Number(destinoId))
      onMigrated?.(result)
    } catch (err) {
      setError(err.message || 'Error al migrar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <div className={styles.header}>
        <h2 className={styles.title}>Migrar cliente</h2>
        <button type="button" className={styles.closeBtn} onClick={onCancel} aria-label="Cerrar">
          <i className="ti ti-x" />
        </button>
      </div>

      <p className={styles.hint}>
        Pasa cuotas, comprobantes, observaciones, miros, fathoms, documentos y próximos pasos
        del origen al destino. Se conserva el nombre del destino y se elimina el origen.
      </p>

      <div className={styles.grid} style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className={styles.field}>
          <span className={styles.label}>Desde (se borra)</span>
          <select
            className={styles.input}
            value={origenId}
            onChange={(e) => {
              setOrigenId(e.target.value)
              setError('')
            }}
            required
          >
            <option value="">Elegir cliente…</option>
            {sorted.map((c) => (
              <option key={c.id} value={c.id} disabled={String(c.id) === String(destinoId)}>
                {clienteOptionLabel(c)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Hacia (queda el nombre)</span>
          <select
            className={styles.input}
            value={destinoId}
            onChange={(e) => {
              setDestinoId(e.target.value)
              setError('')
            }}
            required
          >
            <option value="">Elegir cliente…</option>
            {sorted.map((c) => (
              <option key={c.id} value={c.id} disabled={String(c.id) === String(origenId)}>
                {clienteOptionLabel(c)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {origen && destino ? (
        <p className={styles.hint}>
          Se migrará todo de {origen.nombre} hacia {destino.nombre}. El cliente quedará como
          «{destino.nombre}» y «{origen.nombre}» se eliminará.
        </p>
      ) : null}

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(e) => {
            setConfirmado(e.target.checked)
            setError('')
          }}
        />
        <span>Entiendo que el cliente origen se elimina después de migrar.</span>
      </label>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
        <button type="submit" className={styles.submitBtn} disabled={saving}>
          {saving ? 'Migrando…' : 'Migrar y borrar origen'}
        </button>
      </div>
    </form>
  )
}
