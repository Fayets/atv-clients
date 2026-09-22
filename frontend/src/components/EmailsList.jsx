import { useEffect, useState } from 'react'
import styles from './EmailsList.module.css'

function normalizeEmails(list) {
  const seen = new Set()
  const result = []
  for (const raw of list || []) {
    const email = String(raw || '').trim().toLowerCase()
    if (!email || seen.has(email)) continue
    seen.add(email)
    result.push(email)
  }
  return result
}

export default function EmailsList({ emails = [], onSave, className = '' }) {
  const [items, setItems] = useState(() => normalizeEmails(emails))
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setItems(normalizeEmails(emails))
  }, [emails])

  const persist = async (next) => {
    const normalized = normalizeEmails(next)
    if (!normalized.length) {
      setError('Indicá al menos un email.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onSave(normalized)
      setItems(normalized)
    } catch (err) {
      setError(err.message || 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const addEmail = async () => {
    const value = draft.trim().toLowerCase()
    if (!value) return
    if (!value.includes('@')) {
      setError('Email inválido.')
      return
    }
    if (items.includes(value)) {
      setDraft('')
      setError('')
      return
    }
    setDraft('')
    await persist([...items, value])
  }

  const removeEmail = async (email) => {
    if (items.length <= 1) {
      setError('Tiene que quedar al menos un email.')
      return
    }
    await persist(items.filter((item) => item !== email))
  }

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')}>
      <ul className={styles.list}>
        {items.map((email) => (
          <li key={email} className={styles.item}>
            <span className={styles.email}>{email}</span>
            <button
              type="button"
              className={styles.removeBtn}
              onClick={() => removeEmail(email)}
              disabled={saving || items.length <= 1}
              aria-label={`Quitar ${email}`}
              title="Quitar"
            >
              <i className="ti ti-x" />
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.addRow}>
        <input
          type="email"
          className={styles.input}
          value={draft}
          placeholder="Agregar otro email"
          disabled={saving}
          onChange={(event) => {
            setDraft(event.target.value)
            if (error) setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addEmail()
            }
          }}
        />
        <button
          type="button"
          className={styles.addBtn}
          onClick={addEmail}
          disabled={saving || !draft.trim()}
        >
          Agregar
        </button>
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}
