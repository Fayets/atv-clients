import PlanBadge from './PlanBadge'
import { CATEGORIA_META } from '../utils/analisisIA'
import { formatDateTime, formatPlan, formatUsd } from '../utils/format'
import styles from './AnalisisClienteCard.module.css'

const URGENCIA_LABEL = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

function categoriaMeta(categoria) {
  return CATEGORIA_META[categoria] || CATEGORIA_META.win
}

function toneClassName(tone) {
  const map = {
    win: styles.cardWin,
    upsell: styles.cardUpsell,
  }
  return map[tone] || styles.cardWin
}

function tagClassName(tone) {
  const map = {
    win: styles.tagWin,
    upsell: styles.tagUpsell,
  }
  return map[tone] || styles.tagWin
}

function buildTitulo(item, categoria) {
  if (item.titulo) return item.titulo
  const label = categoria === 'upsell' ? 'Oportunidad de upsell' : 'Win'
  return `${label} — ${item.cliente_nombre}`
}

function buildSenalLine(item) {
  const partes = []
  if (item.señal || item.senal) partes.push(item.señal || item.senal)
  if (item.confianza != null) partes.push(`Confianza ${item.confianza}%`)
  if (item.tendencia) partes.push(`Tendencia ${item.tendencia}`)
  return partes.join(' · ')
}

export default function AnalisisClienteCard({ item, onOpenCliente }) {
  const categoria = item.categoria || item.tipo
  const meta = categoriaMeta(categoria)
  const toneClass = toneClassName(meta.tone)
  const titulo = buildTitulo(item, categoria)
  const senalLine = buildSenalLine(item)
  const frase = item.frase_cliente || item.evidencia
  const logros = Array.isArray(item.logros) ? item.logros.filter(Boolean) : []
  const accionReunion = item.accion_reunion || item.accion

  return (
    <article className={`${styles.card} ${toneClass}`}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.tagRow}>
            <span className={`${styles.catTag} ${tagClassName(meta.tone)}`}>
              <i className={`ti ${meta.icon}`} />
              {meta.label}
            </span>
            {item.urgencia ? (
              <span className={styles.urgenciaInline}>
                Urgencia {URGENCIA_LABEL[item.urgencia] || item.urgencia}
              </span>
            ) : null}
          </div>
          <h3 className={styles.title}>{titulo}</h3>
          <p className={styles.clienteLine}>
            <strong>Cliente:</strong> {item.cliente_nombre}
          </p>
          <div className={styles.badges}>
            <PlanBadge plan={item.plan} />
            {item.programa && item.programa !== item.plan ? (
              <span className={styles.programHint}>→ {formatPlan(item.programa)}</span>
            ) : null}
            {item.monto_usd != null ? (
              <span className={styles.montoInline}>{formatUsd(item.monto_usd)}</span>
            ) : null}
          </div>
        </div>
        {item.cliente_id ? (
          <button
            type="button"
            className={styles.openBtn}
            onClick={() => onOpenCliente?.(item.cliente_id)}
          >
            Ver ficha
            <i className="ti ti-arrow-right" />
          </button>
        ) : null}
      </header>

      {senalLine ? (
        <p className={styles.senalLine}>
          <strong>{categoria === 'upsell' ? 'Señal de upsell:' : 'Señal de win:'}</strong>{' '}
          {senalLine}
        </p>
      ) : null}

      {frase ? (
        <blockquote className={styles.quote}>
          <span className={styles.quoteLabel}>Frase del cliente</span>
          <p>&ldquo;{frase}&rdquo;</p>
        </blockquote>
      ) : null}

      {logros.length > 0 ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Logros del cliente</h4>
          <ul className={styles.logrosList}>
            {logros.map((logro) => (
              <li key={logro}>{logro}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {accionReunion ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Acción para la reunión de producto</h4>
          <p className={styles.bodyText}>{accionReunion}</p>
        </section>
      ) : null}

      {item.resumen ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Resumen</h4>
          <p className={styles.bodyText}>{item.resumen}</p>
        </section>
      ) : null}

      <footer className={styles.footer}>
        <span>Análisis ATV</span>
        <span>·</span>
        <span>{formatDateTime(item.analizado_at)}</span>
        <span className={styles.footerHint}>Fuente: transcripts Discord · Claude</span>
      </footer>
    </article>
  )
}
