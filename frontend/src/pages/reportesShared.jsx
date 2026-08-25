import { useState } from 'react'
import { delta, fechaCorta, numero, TIPO_ICON } from '../utils/reportes'
import styles from './Reportes.module.css'

/**
 * Componentes compartidos por las páginas de Marketing y Ventas:
 * tarjetas de KPI, miniaturas, tags y cards de pieza.
 */

export function Delta({ actual, anterior, invertido = false }) {
  const { pct, dir } = delta(actual, anterior)
  if (dir === 'flat') {
    return <span className={`${styles.delta} ${styles.deltaFlat}`}>— igual</span>
  }
  const bueno = invertido ? dir === 'down' : dir === 'up'
  return (
    <span className={`${styles.delta} ${bueno ? styles.deltaUp : styles.deltaDown}`}>
      <i className={`ti ti-${dir === 'up' ? 'arrow-up-right' : 'arrow-down-right'}`} />
      {pct}%
    </span>
  )
}

export function KpiCard({ label, valor, anterior, sub, formato = numero, invertido = false, accent }) {
  return (
    <div className={[styles.kpi, accent].filter(Boolean).join(' ')}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{formato(valor)}</span>
      <span className={styles.kpiFoot}>
        <Delta actual={valor} anterior={anterior} invertido={invertido} />
        <span className={styles.kpiSub}>{sub}</span>
      </span>
    </div>
  )
}

/**
 * Miniatura de una pieza. Si el archivo no existe (o la pieza no tiene
 * thumbnail sincronizado), cae a un placeholder con el ícono del canal.
 */
export function Thumb({ src, tipo, alt, formato = 'vertical', size = 'md' }) {
  const [falla, setFalla] = useState(false)
  const clases = [
    styles.thumb,
    formato === 'horizontal' ? styles.thumbHorizontal : styles.thumbVertical,
    size === 'sm' ? styles.thumbSm : '',
    size === 'xs' ? styles.thumbXs : '',
  ].filter(Boolean).join(' ')

  if (!src || falla) {
    return (
      <span className={`${clases} ${styles.thumbVacio}`} title="Sin miniatura">
        <i className={`ti ${TIPO_ICON[tipo] || 'ti-photo'}`} />
      </span>
    )
  }

  return (
    <span className={clases}>
      <img src={src} alt={alt || ''} loading="lazy" onError={() => setFalla(true)} />
    </span>
  )
}

export function Tag({ children, tipo }) {
  if (!children) {
    return <span className={`${styles.tag} ${styles.tagVacio}`}>sin cargar</span>
  }
  return <span className={`${styles.tag} ${styles[tipo] || ''}`}>{children}</span>
}

export function PiezaCard({ pieza, tipo, children }) {
  const esHistoria = tipo === 'historia'

  return (
    <article className={styles.pieza}>
      <header className={styles.piezaHead}>
        <span className={styles.piezaFecha}>
          <i className={`ti ${TIPO_ICON[tipo] || 'ti-photo'}`} />
          {fechaCorta(pieza.fecha)}
        </span>
        {pieza.cash > 0 ? (
          <span className={styles.piezaCash}>{formatUsd(pieza.cash)}</span>
        ) : null}
      </header>

      {esHistoria ? (
        <div className={styles.slides}>
          {(pieza.thumbs || Array.from({ length: pieza.slides || 0 })).map((src, i) => (
            <Thumb
              key={`${pieza.id}-${i}`}
              src={src}
              tipo="historia"
              size="sm"
              alt={`Slide ${i + 1}`}
            />
          ))}
        </div>
      ) : (
        <Thumb
          src={pieza.thumb}
          tipo={tipo}
          alt={pieza.titulo}
          formato={tipo === 'youtube' ? 'horizontal' : 'vertical'}
        />
      )}

      <p className={styles.piezaTitulo}>{pieza.titulo || `Secuencia de ${pieza.slides} historias`}</p>
      {children}
      <div className={styles.tagRow}>
        <Tag tipo="tagDolor">{pieza.dolor}</Tag>
        <Tag tipo="tagAngulo">{pieza.angulo}</Tag>
        <Tag tipo="tagCta">{pieza.cta}</Tag>
      </div>
    </article>
  )
}

export function Metricas({ items }) {
  return (
    <dl className={styles.metricas}>
      {items.map((item) => (
        <div key={item.label} className={item.destacado ? styles.metricaDestacada : undefined}>
          <dt>{item.label}</dt>
          <dd>{item.valor}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HeroReporte({ titulo, subtitulo, enVivo = false, children }) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <h1 className={styles.heroTitle}>{titulo}</h1>
        <p className={styles.heroSubtitle}>{subtitulo}</p>
      </div>
      <div className={styles.heroAcciones}>
        {children}
        <span className={enVivo ? styles.vivoBadge : styles.mockBadge}>
          <i className={`ti ${enVivo ? 'ti-plug-connected' : 'ti-flask'}`} />
          {enVivo ? 'ATV MKT' : 'Datos de ejemplo'}
        </span>
      </div>
    </header>
  )
}
