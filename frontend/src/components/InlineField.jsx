import { useEffect, useRef, useState } from 'react'
import styles from './InlineField.module.css'

export default function InlineField({
  value,
  onSave,
  type = 'text',
  options = [],
  displayValue,
  className = '',
  placeholder = '—',
  variant = 'default',
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [status, setStatus] = useState('idle')
  const inputRef = useRef(null)

  useEffect(() => {
    setDraft(value ?? '')
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  const finish = async (commit) => {
    setEditing(false)
    if (!commit) {
      setDraft(value ?? '')
      setStatus('idle')
      return
    }

    const normalizedDraft = draft === '' ? null : draft
    const normalizedValue = value ?? null
    if (String(normalizedDraft) === String(normalizedValue)) {
      setStatus('idle')
      return
    }

    setStatus('saving')
    try {
      await onSave(normalizedDraft)
      setStatus('success')
      setTimeout(() => setStatus('idle'), 1200)
    } catch {
      setDraft(value ?? '')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 1600)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && type !== 'textarea') {
      event.preventDefault()
      finish(true)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      finish(false)
    }
  }

  const statusClass =
    status === 'success' ? styles.success : status === 'error' ? styles.error : ''

  const displayClass = variant === 'chip' ? styles.displayChip : styles.display

  if (!editing) {
    return (
      <button
        type="button"
        className={`${displayClass} ${statusClass} ${className}`}
        onClick={(event) => {
          event.stopPropagation()
          setEditing(true)
        }}
      >
        {displayValue ?? (value === null || value === undefined || value === '' ? placeholder : value)}
      </button>
    )
  }

  if (type === 'select') {
    return (
      <select
        ref={inputRef}
        className={`${styles.input} ${statusClass} ${className}`}
        value={draft ?? ''}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={handleKeyDown}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  if (type === 'textarea') {
    return (
      <textarea
        ref={inputRef}
        className={`${styles.textarea} ${statusClass} ${className}`}
        value={draft}
        rows={4}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={handleKeyDown}
      />
    )
  }

  return (
    <input
      ref={inputRef}
      type={type}
      className={`${styles.input} ${statusClass} ${className}`}
      value={draft}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={handleKeyDown}
    />
  )
}
