import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchDashboard } from '../api/clientes'
import Navbar from '../components/Navbar'
import PlanBadge from '../components/PlanBadge'
import {
  formatDate,
  formatLocalDateISO,
  formatUsd,
  parseDateValue,
  todayLocalISO,
} from '../utils/format'
import { navigate } from '../utils/navigation'
import styles from './HomePage.module.css'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function monthOptions() {
  const hoy = new Date()
  const options = []
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    options.push({
      mes: d.getMonth() + 1,
      anio: d.getFullYear(),
      label: `${MESES[d.getMonth()]} ${d.getFullYear()}`,
    })
  }
  return options
}

const TAG_CLASS = {
  cuota: 'detailTagCuota',
  sena: 'detailTagSena',
  recompra: 'detailTagRecompra',
  upsell: 'detailTagUpsell',
  posibilidad: 'detailTagPosibilidad',
  vencido: 'detailTagVencido',
  default: 'detailTagDefault',
}

function parseSubtitulo(subtitulo) {
  if (!subtitulo) return { tag: null, extra: null }
  const parts = subtitulo.split(' · ')
  if (parts.length >= 2) {
    return { tag: parts[0], extra: parts.slice(1).join(' · ') }
  }
  return { tag: subtitulo, extra: null }
}

function tagVariant(tag) {
  const t = tag.toLowerCase()
  if (t.includes('posibilidad')) return 'posibilidad'
  if (t.includes('upsell')) return 'upsell'
  if (t.includes('recompra')) return 'recompra'
  if (t.includes('seña') || t.includes('sena')) return 'sena'
  if (t.startsWith('cuota')) return 'cuota'
  if (t.includes('vencido') || t.includes('vence')) return 'vencido'
  return 'default'
}

const CAJA2_TIPOS = new Set(['cuota_upsell', 'cuota_recompra', 'posibilidad_upsell'])
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const PULL_THRESHOLD = 68
const PULL_MAX = 112

function num(value) {
  return Number(value) || 0
}

function pct(part, total) {
  if (!total) return 0
  return Math.max(0, (num(part) / num(total)) * 100)
}

function isoDate(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  return formatLocalDateISO(value)
}

function startOfWeekMonday(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const weekday = date.getDay()
  const offset = weekday === 0 ? 6 : weekday - 1
  date.setDate(date.getDate() - offset)
  return formatLocalDateISO(date)
}

function shiftWeek(iso, days) {
  const date = parseDateValue(iso)
  if (!date) return iso
  date.setDate(date.getDate() + days)
  return formatLocalDateISO(date)
}

function formatWeekRange(inicio, fin) {
  const from = parseDateValue(inicio)
  const to = parseDateValue(fin)
  if (!from || !to) return ''
  if (from.getMonth() === to.getMonth()) {
    return `${from.getDate()}–${to.getDate()} ${MESES_CORTOS[from.getMonth()]}`
  }
  return `${from.getDate()} ${MESES_CORTOS[from.getMonth()]} – ${to.getDate()} ${MESES_CORTOS[to.getMonth()]}`
}

function formatUsdCell(value) {
  const amount = Number(value) || 0
  if (amount === 0) return '—'
  return `$${Math.round(amount).toLocaleString('es-AR')}`
}

function CajaMesCard({ kicker, title, cobrado, extra, accent, active, onClick }) {
  return (
    <button
      type="button"
      className={[
        styles.cajaCard,
        accent,
        active ? styles.cajaCardActive : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <span className={styles.cajaKicker}>{kicker}</span>
      <span className={styles.cajaTitle}>{title}</span>
      <span className={styles.cajaValue}>{formatUsd(cobrado)}</span>
      {extra ? <p className={styles.cajaExtra}>{extra}</p> : null}
      <span className={styles.cardHint}>{active ? 'Ocultar pagos' : 'Ver pagos'}</span>
    </button>
  )
}

function MesCajas({ mesLabel, mesCajas, loading, popupId, onCobrado }) {
  const venta = num(mesCajas?.venta?.cobrado_usd)
  const upsell = num(mesCajas?.upsell?.cobrado_usd)
  const recompra = num(mesCajas?.recompra?.cobrado_usd)
  const caja2 = upsell + recompra
  const total = venta + caja2

  return (
    <section className={styles.splitCard}>
      <div className={styles.splitHead}>
        <div>
          <h2 className={styles.chartTitle}>Plata del mes</h2>
          <p className={styles.chartMeta}>
            {mesLabel || 'Mes'} · solo cobrado
          </p>
        </div>
        <span className={styles.splitTotal}>
          {loading ? '…' : formatUsd(total)}
        </span>
      </div>

      <div className={styles.splitGrid}>
        <CajaMesCard
          kicker="Caja 1"
          title="Nuevas ventas / cuotas ventas"
          cobrado={venta}
          accent={styles.cajaVenta}
          active={popupId === 'caja1'}
          onClick={() => onCobrado('caja1')}
        />
        <CajaMesCard
          kicker="Caja 2"
          title="Upsell y recompra"
          cobrado={caja2}
          extra={`Upsell ${formatUsd(upsell)} · Recompra ${formatUsd(recompra)}`}
          accent={styles.cajaProyeccion}
          active={popupId === 'caja2'}
          onClick={() => onCobrado('caja2')}
        />
      </div>
    </section>
  )
}

function formatDiaLargo(iso) {
  const date = parseDateValue(iso)
  if (!date) return ''
  const names = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  return `${names[date.getDay()]} ${date.getDate()} ${MESES_CORTOS[date.getMonth()]}`
}

function DiaCirculo({ dia, loading, onPrev, onNext, onHoy, onOpen, actualizadoLabel }) {
  const fecha = isoDate(dia?.fecha)
  const hoy = todayLocalISO()
  const esHoy = fecha === hoy
  const caja1 = num(dia?.caja1_usd)
  const caja2 = num(dia?.caja2_usd)
  const total = num(dia?.cobrado_usd) || caja1 + caja2
  const p1 = total ? (caja1 / total) * 100 : 0
  const start = useRef(null)
  const swiped = useRef(false)

  const onTouchStart = (event) => {
    const touch = event.changedTouches[0]
    start.current = { x: touch.clientX, y: touch.clientY }
    swiped.current = false
  }

  const onTouchEnd = (event) => {
    if (!start.current) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.current.x
    const dy = touch.clientY - start.current.y
    start.current = null
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return
    swiped.current = true
    if (dx > 0) onPrev()
    else onNext()
  }

  return (
    <div
      className={styles.dayCircleWrap}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={styles.dayCircleHead}>
        <h2 className={styles.chartTitle}>{esHoy ? 'Hoy' : formatDiaLargo(fecha)}</h2>
        {esHoy ? (
          <p className={styles.chartMeta}>Cobrado del día</p>
        ) : (
          <button type="button" className={styles.weekTodayBtn} onClick={onHoy}>
            Ir a hoy
          </button>
        )}
      </div>
      <button
        type="button"
        className={`${styles.dayRing} ${total ? '' : styles.dayRingEmpty}`}
        style={total ? { background: `conic-gradient(#f79009 0 ${p1}%, #6172f3 ${p1}% 100%)` } : undefined}
        onClick={() => {
          if (swiped.current || !fecha) return
          onOpen(fecha)
        }}
      >
        <span className={styles.dayRingInner}>
          <span className={styles.dayRingKicker}>{esHoy ? 'Hoy' : dia?.label || ''}</span>
          <span className={styles.dayRingValue}>{loading ? '…' : formatUsd(total)}</span>
        </span>
      </button>
      <ul className={styles.dayRingLegend}>
        <li>
          <span className={`${styles.legendSwatch} ${styles.barCuotas}`} />
          Caja 1 {loading ? '…' : formatUsd(caja1)}
        </li>
        <li>
          <span className={`${styles.legendSwatch} ${styles.barRecompra}`} />
          Caja 2 {loading ? '…' : formatUsd(caja2)}
        </li>
      </ul>
      <p className={styles.dayRingHint}>
        {loading ? '…' : (actualizadoLabel || 'Todavía no hay cargas de caja')}
      </p>
    </div>
  )
}

function SemanaCalendario({
  semana,
  loading,
  diaSeleccionado,
  onPrev,
  onNext,
  onToday,
  onPrevDay,
  onNextDay,
  onHoy,
  onDia,
  activeFecha,
  actualizadoLabel,
}) {
  const dias = semana?.dias || []
  const hoy = todayLocalISO()
  const esEstaSemana = isoDate(semana?.inicio) === startOfWeekMonday()
  const total = num(semana?.total_usd)
  const dia = dias.find((item) => isoDate(item.fecha) === diaSeleccionado) || null

  return (
    <section className={styles.chartCard}>
      <div className={`${styles.chartHead} ${styles.weekHead}`}>
        <div>
          <h2 className={styles.chartTitle}>{esEstaSemana ? 'Esta semana' : 'Semana'}</h2>
          <p className={styles.chartMeta}>
            {formatWeekRange(semana?.inicio, semana?.fin)} · cobrado
            {actualizadoLabel ? ` · ${actualizadoLabel}` : ''}
          </p>
        </div>
        <div className={styles.weekToolbar}>
          <span className={styles.weekTotal}>{loading ? '…' : formatUsd(total)}</span>
          <div className={styles.weekNav}>
            <button type="button" onClick={onPrev} aria-label="Semana anterior">
              <i className="ti ti-chevron-left" />
            </button>
            {esEstaSemana ? null : (
              <button type="button" className={styles.weekTodayBtn} onClick={onToday}>
                Hoy
              </button>
            )}
            <button type="button" onClick={onNext} aria-label="Semana siguiente">
              <i className="ti ti-chevron-right" />
            </button>
          </div>
        </div>
      </div>
      {loading && !dias.length ? (
        <p className={`${styles.chartEmpty} ${styles.weekHead}`}>Cargando semana…</p>
      ) : (
        <div className={styles.weekGrid}>
          {dias.map((dia) => {
            const fecha = isoDate(dia.fecha)
            const cobrado = num(dia.cobrado_usd)
            const isToday = fecha === hoy
            const isFuture = fecha > hoy
            const active = activeFecha === fecha
            const dayNum = parseDateValue(fecha)?.getDate()
            return (
              <button
                key={fecha}
                type="button"
                className={[
                  styles.weekDay,
                  isToday ? styles.weekDayToday : '',
                  cobrado > 0 ? styles.weekDayMoney : '',
                  isFuture ? styles.weekDayFuture : '',
                  active ? styles.weekDayActive : '',
                ].filter(Boolean).join(' ')}
                onClick={() => onDia(fecha)}
              >
                <span className={styles.weekDayName}>{dia.label}</span>
                <span className={styles.weekDayNum}>{dayNum}</span>
                <span className={styles.weekDayAmount}>{formatUsdCell(cobrado)}</span>
              </button>
            )
          })}
        </div>
      )}
      <DiaCirculo
        dia={dia || { fecha: diaSeleccionado }}
        loading={loading}
        onPrev={onPrevDay}
        onNext={onNextDay}
        onHoy={onHoy}
        onOpen={onDia}
        actualizadoLabel={actualizadoLabel}
      />
    </section>
  )
}

function DetailList({ items }) {
  if (items.length === 0) {
    return <p className={styles.detailEmpty}>Sin registros.</p>
  }
  return (
    <ul className={styles.detailList}>
      {items.map((item, index) => {
        const { tag, extra } = parseSubtitulo(item.subtitulo)
        const variant = tag ? tagVariant(tag) : 'default'
        return (
          <li
            key={`${item.cliente_id}-${item.subtitulo}-${index}`}
            className={styles.detailRow}
            onClick={() => navigate(`/cliente/${item.cliente_id}`)}
          >
            <span className={styles.detailName}>{item.nombre}</span>
            <span className={styles.detailTagCell}>
              {tag ? (
                <span className={`${styles.detailTag} ${styles[TAG_CLASS[variant] || TAG_CLASS.default]}`}>
                  {tag}
                </span>
              ) : null}
            </span>
            <span className={styles.detailTagExtra}>{extra || ''}</span>
            <span className={styles.detailPlan}>
              <PlanBadge plan={item.plan_actual} />
            </span>
            <span className={styles.detailAmount}>{formatUsd(item.monto_usd)}</span>
          </li>
        )
      })}
    </ul>
  )
}

function PagosPopup({ title, hint, items, onClose }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className={styles.popupBackdrop} onClick={onClose} role="presentation">
      <div
        className={styles.popup}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pagos-popup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.popupHead}>
          <div>
            <h2 id="pagos-popup-title" className={styles.popupTitle}>{title}</h2>
            {hint ? <p className={styles.popupMeta}>{hint}</p> : null}
          </div>
          <button type="button" className={styles.detailClose} onClick={onClose}>
            <i className="ti ti-x" />
            Cerrar
          </button>
        </div>
        <DetailList items={items} />
      </div>
    </div>
  )
}

export default function HomePage() {
  const mesesDisponibles = useMemo(() => monthOptions(), [])
  const [mes, setMes] = useState(mesesDisponibles[0].mes)
  const [anio, setAnio] = useState(mesesDisponibles[0].anio)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [popupId, setPopupId] = useState(null)
  const [semanaInicio, setSemanaInicio] = useState(() => startOfWeekMonday())
  const [diaSeleccionado, setDiaSeleccionado] = useState(() => todayLocalISO())
  const [refreshing, setRefreshing] = useState(false)
  const [pullPx, setPullPx] = useState(0)
  const pullPxRef = useRef(0)
  const pullRef = useRef({ active: false, armed: false, startX: 0, startY: 0 })
  const refreshingRef = useRef(false)
  const popupOpenRef = useRef(false)
  const refreshFnRef = useRef(async () => {})
  const pageRef = useRef(null)

  const setPull = (value) => {
    pullPxRef.current = value
    setPullPx(value)
  }

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const result = await fetchDashboard({ mes, anio, semana: semanaInicio })
      setData(result)
    } catch (err) {
      if (!silent) setData(null)
      setError(err.message || 'Error al cargar el dashboard')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [mes, anio, semanaInicio])

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    setPull(PULL_THRESHOLD)
    try {
      await load({ silent: true })
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
      setPull(0)
    }
  }, [load])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    popupOpenRef.current = Boolean(popupId)
  }, [popupId])

  useEffect(() => {
    refreshFnRef.current = refresh
  }, [refresh])

  useEffect(() => {
    const el = pageRef.current
    if (!el) return

    const scrollTop = () => el.scrollTop

    const onStart = (event) => {
      if (popupOpenRef.current || refreshingRef.current) return
      if (scrollTop() > 2) return
      const touch = event.changedTouches[0]
      pullRef.current = {
        active: true,
        armed: false,
        startX: touch.clientX,
        startY: touch.clientY,
      }
    }

    const onMove = (event) => {
      const state = pullRef.current
      if (!state.active || refreshingRef.current || popupOpenRef.current) return
      const touch = event.changedTouches[0]
      const dy = touch.clientY - state.startY
      const dx = touch.clientX - state.startX
      if (!state.armed) {
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
          state.active = false
          return
        }
        if (dy < 10) return
        if (scrollTop() > 2) {
          state.active = false
          return
        }
        state.armed = true
      }
      if (dy <= 0) {
        setPull(0)
        return
      }
      if (event.cancelable) event.preventDefault()
      setPull(Math.min(PULL_MAX, dy * 0.42))
    }

    const onEnd = () => {
      const state = pullRef.current
      if (!state.active) return
      state.active = false
      if (state.armed && pullPxRef.current >= PULL_THRESHOLD) {
        refreshFnRef.current()
      } else {
        setPull(0)
      }
      state.armed = false
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const resumen = data?.resumen
  const detalles = data?.detalles || {}

  const cards = [
    {
      id: 'cuotas',
      label: 'Cuotas a cobrar',
      value: resumen?.cuotas_a_cobrar_usd,
      sub: 'Caja 1 · cuota venta pendiente del mes',
      subShort: 'Caja 1',
      accent: styles.cardCuotas,
    },
    {
      id: 'proyeccion',
      label: 'Proyección',
      value: resumen?.proyeccion_usd,
      sub: 'Caja 2 · upsell y recompras pendientes',
      subShort: 'Upsell y recompras',
      accent: styles.cardProyeccion,
    },
    {
      id: 'total',
      label: 'Pendiente del mes',
      value: resumen?.total_mes_usd,
      sub: `Caja 1 ${formatUsd(resumen?.cuotas_a_cobrar_usd ?? 0)} + Caja 2 ${formatUsd(resumen?.proyeccion_usd ?? 0)}`,
      subShort: 'Caja 1 + Caja 2',
      accent: styles.cardTotal,
    },
  ]

  const cuotasItems = detalles.cuotas || []
  const proyeccionItems = detalles.proyeccion || []
  const cobradoVenta = (detalles.cobrado || []).filter((item) => !CAJA2_TIPOS.has(item.tipo))
  const cobradoCaja2 = (detalles.cobrado || []).filter((item) => CAJA2_TIPOS.has(item.tipo))
  const popupConfig = {
    cuotas: {
      title: `Cuotas a cobrar — ${resumen?.mes_label || ''}`,
      hint: `${cuotasItems.length} cuotas · Caja 1`,
      items: cuotasItems,
    },
    proyeccion: {
      title: `Proyección — ${resumen?.mes_label || ''}`,
      hint: `${proyeccionItems.length} upsells, posibilidades y recompras · Caja 2`,
      items: proyeccionItems,
    },
    total: {
      title: `Pendiente del mes — ${resumen?.mes_label || ''}`,
      hint: `${cuotasItems.length + proyeccionItems.length} pendientes · Caja 1 + Caja 2`,
      items: [...cuotasItems, ...proyeccionItems],
    },
    caja1: {
      title: `Cobrado · Caja 1 — ${resumen?.mes_label || ''}`,
      hint: `${cobradoVenta.length} pagos · nuevas ventas y cuotas`,
      items: cobradoVenta,
    },
    caja2: {
      title: `Cobrado · Caja 2 — ${resumen?.mes_label || ''}`,
      hint: `${cobradoCaja2.length} pagos · upsell y recompra`,
      items: cobradoCaja2,
    },
  }

  const openPopup = (id) => {
    setPopupId((prev) => (prev === id ? null : id))
  }

  const openDiaPopup = (fecha) => {
    const id = `dia:${fecha}`
    setPopupId((prev) => (prev === id ? null : id))
  }

  const closePopup = useCallback(() => setPopupId(null), [])

  const goWeek = (iso) => {
    setSemanaInicio(iso)
    setPopupId((prev) => (prev?.startsWith('dia:') ? null : prev))
  }

  const goDay = (days) => {
    const next = shiftWeek(diaSeleccionado, days)
    setDiaSeleccionado(next)
    const monday = startOfWeekMonday(parseDateValue(next) || new Date())
    if (monday !== semanaInicio) setSemanaInicio(monday)
    setPopupId((prev) => (prev?.startsWith('dia:') ? null : prev))
  }

  const goHoy = () => {
    const hoy = todayLocalISO()
    setDiaSeleccionado(hoy)
    setSemanaInicio(startOfWeekMonday())
    setPopupId((prev) => (prev?.startsWith('dia:') ? null : prev))
  }

  let popup = popupId ? popupConfig[popupId] : null
  if (popupId?.startsWith('dia:')) {
    const fecha = popupId.slice(4)
    const items = (detalles.semana || []).filter((item) => isoDate(item.fecha) === fecha)
    const dia = (data?.semana?.dias || []).find((d) => isoDate(d.fecha) === fecha)
    popup = {
      title: `Cobrado · ${dia?.label || ''} ${formatDate(fecha)}`,
      hint: `${items.length} pagos`,
      items,
    }
  }

  return (
    <div className={styles.page} ref={pageRef}>
      <Navbar currentPath="/" />

      <div
        className={[
          styles.pullSlot,
          pullPx > 0 && !refreshing ? styles.pullSlotLive : '',
        ].filter(Boolean).join(' ')}
        style={{ height: pullPx }}
        aria-hidden
      >
        <span
          className={[
            styles.pullSpinner,
            refreshing || pullPx >= PULL_THRESHOLD ? styles.pullSpinnerSpin : '',
          ].filter(Boolean).join(' ')}
          style={
            refreshing || pullPx >= PULL_THRESHOLD
              ? undefined
              : { transform: `rotate(${pullPx * 2.6}deg)` }
          }
        />
      </div>

      <main className={styles.content}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <h1 className={styles.heroTitle}>Dashboard</h1>
            <p className={styles.heroSubtitle}>Cuotas · proyección · plata del mes</p>
          </div>
          <select
            className={styles.monthSelect}
            aria-label="Mes"
            value={`${anio}-${mes}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number)
              setAnio(y)
              setMes(m)
                setPopupId(null)
            }}
          >
            {mesesDisponibles.map((opt) => (
              <option key={`${opt.anio}-${opt.mes}`} value={`${opt.anio}-${opt.mes}`}>
                {opt.label}
              </option>
            ))}
          </select>
        </header>

        {error ? <div className={styles.errorBanner}>{error}</div> : null}

        <section className={styles.cardsGrid}>
          {cards.map((card) => {
            const active = popupId === card.id
            return (
              <button
                key={card.id}
                type="button"
                className={[
                  styles.card,
                  card.accent,
                  styles.clickable,
                  active ? styles.cardActive : '',
                ].filter(Boolean).join(' ')}
                onClick={() => openPopup(card.id)}
              >
                <span className={styles.cardLabel}>{card.label}</span>
                <span className={styles.cardValue}>
                  {loading ? '…' : formatUsd(card.value ?? 0)}
                </span>
                <span className={styles.cardSub}>{loading ? '…' : card.sub}</span>
                <span className={styles.cardSubShort}>{loading ? '…' : card.subShort}</span>
                <span className={styles.cardHint}>
                  {active ? 'Ocultar detalle' : 'Ver detalle'}
                </span>
              </button>
            )
          })}
        </section>

        <MesCajas
          mesLabel={resumen?.mes_label}
          mesCajas={data?.mes_cajas}
          loading={loading}
          popupId={popupId}
          onCobrado={openPopup}
        />

        <SemanaCalendario
          semana={data?.semana}
          loading={loading}
          diaSeleccionado={diaSeleccionado}
          onPrev={() => goWeek(shiftWeek(semanaInicio, -7))}
          onNext={() => goWeek(shiftWeek(semanaInicio, 7))}
          onToday={() => {
            goHoy()
          }}
          onPrevDay={() => goDay(-1)}
          onNextDay={() => goDay(1)}
          onHoy={goHoy}
          onDia={openDiaPopup}
          activeFecha={popupId?.startsWith('dia:') ? popupId.slice(4) : null}
          actualizadoLabel={data?.ultima_actualizacion_label}
        />

        {popup ? (
          <PagosPopup
            title={popup.title}
            hint={popup.hint}
            items={popup.items}
            onClose={closePopup}
          />
        ) : null}
      </main>
    </div>
  )
}
