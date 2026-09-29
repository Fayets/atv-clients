import { formatPlan } from '../utils/format'
import styles from './PlanBadge.module.css'

const PLAN_CLASS = {
  entry: styles.entry,
  mid: styles.mid,
  high: styles.high,
  boost: styles.boost,
  mentoria: styles.mentoria,
  advantage: styles.advantage,
}

export default function PlanBadge({ plan }) {
  return (
    <span className={`${styles.badge} ${PLAN_CLASS[plan] || styles.boost}`}>
      {formatPlan(plan)}
    </span>
  )
}
