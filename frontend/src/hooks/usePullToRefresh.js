import { useCallback, useEffect, useRef, useState } from 'react'

const PULL_THRESHOLD = 68
const PULL_MAX = 112

/**
 * Pull-to-refresh táctil para contenedores con scroll propio.
 * `onRefresh` debe devolver una Promise; mientras corre se muestra el spinner.
 */
export function usePullToRefresh(onRefresh, { enabled = true } = {}) {
  const [refreshing, setRefreshing] = useState(false)
  const [pullPx, setPullPx] = useState(0)
  const pullPxRef = useRef(0)
  const pullRef = useRef({ active: false, armed: false, startX: 0, startY: 0 })
  const refreshingRef = useRef(false)
  const refreshFnRef = useRef(async () => {})
  const pageRef = useRef(null)

  const setPull = useCallback((value) => {
    pullPxRef.current = value
    setPullPx(value)
  }, [])

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return
    refreshingRef.current = true
    setRefreshing(true)
    setPull(PULL_THRESHOLD)
    try {
      await onRefresh()
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
      setPull(0)
    }
  }, [onRefresh, setPull])

  useEffect(() => {
    refreshFnRef.current = refresh
  }, [refresh])

  useEffect(() => {
    const el = pageRef.current
    if (!el || !enabled) return

    const scrollTop = () => el.scrollTop

    const onStart = (event) => {
      if (refreshingRef.current) return
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
      if (!state.active || refreshingRef.current) return
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
  }, [enabled, setPull])

  return {
    pageRef,
    pullPx,
    refreshing,
    pullThreshold: PULL_THRESHOLD,
  }
}
