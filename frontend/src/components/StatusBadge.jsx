import { formatEstado } from '../utils/format'
import styles from './StatusBadge.module.css'

const STATUS_CLASS = {
  vencido: styles.vencido,
  proximo_a_vencer: styles.proximo,
  vigente: styles.vigente,
  estan_bien: styles.estanBien,
  pausa: styles.pausa,
  no_va_a_renovar: styles.noRenovar,
  llamada_recompra: styles.recompra,
  inactivo: styles.inactivo,
}

export default function StatusBadge({ estado }) {
  return (
    <span className={`${styles.badge} ${STATUS_CLASS[estado] || styles.pausa}`}>
      {formatEstado(estado)}
    </span>
  )
}
