import React, { useRef, useCallback, useState } from 'react'
import type { KeyDef, SwipeDir } from './core/types'
import { getSwipeDirection, SWIPE_DIRS, isSpecialKey, MODIFIER_KEYS } from './core/types'

const SWIPE_THRESHOLD = 18
const SLIDE_STEP = 18
const LONG_PRESS_DELAY = 400
const REPEAT_INTERVAL = 60

interface KeyButtonProps {
  keyDef: KeyDef
  modState?: 'inactive' | 'latched' | 'locked'
  shiftActive?: boolean
  onKeyOutput: (value: string, special: boolean) => void
  onSlide: (dir: 'left' | 'right') => void
}

const KeyButton: React.FC<KeyButtonProps> = ({ keyDef, modState, shiftActive, onKeyOutput, onSlide }) => {
  const [pressed, setPressed] = useState(false)
  const [swipeDir, setSwipeDir] = useState<SwipeDir | null>(null)
  const [sliding, setSliding] = useState(false)

  const stateRef = useRef({
    startX: 0, startY: 0,
    lastX: 0,
    isDown: false,
    swiped: null as SwipeDir | null,
    isSliding: false,
    slideAccum: 0,
    didSlide: false,
    firedByRepeat: false,
  })

  const timersRef = useRef<{ delay?: ReturnType<typeof setTimeout>; interval?: ReturnType<typeof setInterval> }>({})

  const resolveValue = useCallback((dir: SwipeDir | null): { value: string; special: boolean } | null => {
    if (dir && keyDef.sub) {
      const subVal = keyDef.sub[dir]
      if (subVal) return { value: subVal, special: isSpecialKey(subVal) }
    }
    if (MODIFIER_KEYS.has(keyDef.value)) {
      return { value: keyDef.value, special: true }
    }
    let val = keyDef.value
    if (keyDef.type === 'char' && shiftActive && val.length === 1 && /^[a-z]$/.test(val)) {
      val = val.toUpperCase()
    }
    if (!val && keyDef.type !== 'modifier') return null
    return { value: val, special: isSpecialKey(keyDef.value) || keyDef.type === 'action' }
  }, [keyDef, shiftActive])

  const fireKey = useCallback((dir: SwipeDir | null) => {
    const resolved = resolveValue(dir)
    if (resolved) onKeyOutput(resolved.value, resolved.special)
  }, [resolveValue, onKeyOutput])

  const clearTimers = useCallback(() => {
    if (timersRef.current.delay) { clearTimeout(timersRef.current.delay); timersRef.current.delay = undefined }
    if (timersRef.current.interval) { clearInterval(timersRef.current.interval); timersRef.current.interval = undefined }
  }, [])

  const startLongPress = useCallback((dir: SwipeDir | null) => {
    clearTimers()
    if (keyDef.type === 'modifier') return
    const resolved = resolveValue(dir)
    if (!resolved || MODIFIER_KEYS.has(resolved.value)) return

    timersRef.current.delay = setTimeout(() => {
      stateRef.current.firedByRepeat = true
      onKeyOutput(resolved.value, resolved.special)
      timersRef.current.interval = setInterval(() => {
        const curDir = stateRef.current.swiped
        const curResolved = resolveValue(curDir)
        if (curResolved) onKeyOutput(curResolved.value, curResolved.special)
      }, REPEAT_INTERVAL)
    }, LONG_PRESS_DELAY)
  }, [keyDef, resolveValue, onKeyOutput, clearTimers])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const s = stateRef.current
    s.startX = e.clientX
    s.startY = e.clientY
    s.lastX = e.clientX
    s.isDown = true
    s.swiped = null
    s.isSliding = false
    s.slideAccum = 0
    s.didSlide = false
    s.firedByRepeat = false
    setPressed(true)
    setSwipeDir(null)
    setSliding(false)

    if (!keyDef.slider) {
      startLongPress(null)
    }
  }, [keyDef, startLongPress])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const s = stateRef.current
    if (!s.isDown) return

    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY

    if (keyDef.slider === 'horizontal') {
      const dist = Math.abs(dx)
      if (dist > SWIPE_THRESHOLD) {
        if (!s.isSliding) {
          s.isSliding = true
          setSliding(true)
          clearTimers()
        }
        const moveDelta = e.clientX - s.lastX
        s.slideAccum += moveDelta
        while (Math.abs(s.slideAccum) >= SLIDE_STEP) {
          if (s.slideAccum > 0) {
            onSlide('right')
            s.slideAccum -= SLIDE_STEP
          } else {
            onSlide('left')
            s.slideAccum += SLIDE_STEP
          }
          s.didSlide = true
        }
      }
      s.lastX = e.clientX
      return
    }

    const dir = getSwipeDirection(dx, dy, SWIPE_THRESHOLD)
    if (dir !== s.swiped) {
      s.swiped = dir
      setSwipeDir(dir)
      startLongPress(dir)
    }
  }, [keyDef, onSlide, clearTimers, startLongPress])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const s = stateRef.current
    if (!s.isDown) return
    s.isDown = false
    clearTimers()

    if (keyDef.slider === 'horizontal') {
      if (!s.didSlide) fireKey(null)
      setSliding(false)
      setPressed(false)
      return
    }

    if (!s.firedByRepeat) {
      fireKey(s.swiped)
    }

    setPressed(false)
    setSwipeDir(null)
  }, [keyDef, fireKey, clearTimers])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  const isFnKey = keyDef.type === 'modifier' || keyDef.type === 'action'
  const isSpace = keyDef.slider === 'horizontal'
  const labelSmall = keyDef.label.length > 2

  let classes = 'tk-key'
  if (isFnKey) classes += ' tk-key--fn'
  if (pressed) classes += ' tk-key--pressed'
  if (isSpace) classes += ' tk-key--space'
  if (modState === 'latched') classes += ' tk-key--latched'
  if (modState === 'locked') classes += ' tk-key--locked'

  const swipeSubVal = swipeDir && keyDef.sub?.[swipeDir]

  const displayLabel = (() => {
    if (keyDef.type === 'char' && shiftActive && keyDef.value.length === 1 && /^[a-z]$/.test(keyDef.value)) {
      return keyDef.value.toUpperCase()
    }
    return keyDef.label
  })()

  return (
    <div
      className={classes}
      style={{ '--key-flex': keyDef.width ?? 1 } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={handleContextMenu}
    >
      {SWIPE_DIRS.map(dir => {
        const sub = keyDef.sub?.[dir]
        if (!sub) return null
        const highlight = swipeDir === dir
        return (
          <span
            key={dir}
            className={`tk-sub tk-sub--${dir}${highlight ? ' tk-sub--highlight' : ''}`}
          >
            {sub}
          </span>
        )
      })}
      <span className={`tk-label${labelSmall ? ' tk-label--small' : ''}`}>{displayLabel}</span>
      {swipeSubVal && pressed && (
        <div className="tk-swipe-preview">{swipeSubVal}</div>
      )}
      {sliding && (
        <div className="tk-swipe-preview">⇔</div>
      )}
    </div>
  )
}

export default React.memo(KeyButton)
