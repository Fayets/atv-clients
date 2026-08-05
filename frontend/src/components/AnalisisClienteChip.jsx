import PlanBadge from './PlanBadge'
import { CATEGORIA_META } from '../utils/analisisIA'
import styles from './AnalisisClienteChip.module.css'

function chipClass(categoria) {
  if (categoria === 'win') return styles.chipWin
  if (categoria === 'upsell') return styles.chipUpsell
  return styles.chipNeutral
}

function estadoLabel(categoria) {
  if (categoria === 'win') return CATEGORIA_META.win.label
  if (categoria === 'upsell') return CATEGORIA_META.upsell.label
  return 'Sin señal'
}

export default function AnalisisClienteChip({ item, onOpenCliente }) {
  const categoria = item.categoria || item.tipo || null
  const clickable = Boolean(item.cliente_id && onOpenCliente)

  return (
    <article
      className={`${styles.chip} ${chipClass(categoria)} ${clickable ? styles.chipClickable : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpenCliente(item.cliente_id) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpenCliente(item.cliente_id)
              }
            }
          : undefined
      }
    >
      <div className={styles.chipTop}>
        <span className={styles.chipEstado}>{estadoLabel(categoria)}</span>
        <PlanBadge plan={item.plan} />
      </div>
      <h3 className={styles.chipNombre}>{item.cliente_nombre}</h3>
    </article>
  )
}
