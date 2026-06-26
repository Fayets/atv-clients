import { formatPlan } from '../utils/format'
import styles from './PlanBadge.module.css'

const PLAN_CLASS = {
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
