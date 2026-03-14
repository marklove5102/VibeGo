import React, { useRef, useCallback, useState } from 'react'
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowBigUp,
  ArrowBigUpDash,
  ArrowRightToLine,
  ArrowLeftToLine,
  ChevronsUp,
  ChevronsDown,
  MoveHorizontal,
  Delete,
  CornerDownLeft,
  Undo2,
  Scissors,
  Copy,
  Clipboard,
  ClipboardPaste,
  ClipboardList,
  Keyboard,
  Smile,
  Mic,
  BoxSelect
} from 'lucide-react'
import type { KeyDef, SwipeDir } from '@/components/keyboard/core/types'
import { getSwipeDirection, isSpecialKey, MODIFIER_KEYS, SWIPE_DIRS } from '@/components/keyboard/core/types'

const SWIPE_THRESHOLD = 18
const SLIDE_STEP = 18
const LONG_PRESS_DELAY = 800
const REPEAT_INTERVAL = 120

const DISPLAY_LABELS: Record<string, React.ReactNode> = {
  ArrowUp: <ArrowUp size={12} strokeWidth={2.5} />,
  ArrowDown: <ArrowDown size={12} strokeWidth={2.5} />,
  ArrowLeft: <ArrowLeft size={12} strokeWidth={2.5} />,
  ArrowRight: <ArrowRight size={12} strokeWidth={2.5} />,
  PageUp: <ChevronsUp size={12} strokeWidth={2.5} />,
  PageDown: <ChevronsDown size={12} strokeWidth={2.5} />,
  Home: <ArrowLeftToLine size={12} strokeWidth={2.5} />,
  End: <ArrowRightToLine size={12} strokeWidth={2.5} />,
  Escape: 'Esc',
  Backspace: <Delete size={12} strokeWidth={2.5} />,
  Enter: <CornerDownLeft size={12} strokeWidth={2.5} />,
  Insert: 'Ins',
  Delete: 'Del',
  Tab: <ArrowRightToLine size={12} strokeWidth={2.5} />,
  Select: <BoxSelect size={12} strokeWidth={2.5} />,
  Undo: <Undo2 size={12} strokeWidth={2.5} />,
  Cut: <Scissors size={12} strokeWidth={2.5} />,
  Copy: <Copy size={12} strokeWidth={2.5} />,
  Paste: <ClipboardPaste size={12} strokeWidth={2.5} />,
  Clipboard: <ClipboardList size={12} strokeWidth={2.5} />,
  Keyboard: <Keyboard size={12} strokeWidth={2.5} />,
  Emoji: <Smile size={12} strokeWidth={2.5} />,
  Mic: <Mic size={12} strokeWidth={2.5} />,
  Caps: <ArrowBigUpDash size={12} strokeWidth={2.5} />,
}

const MAIN_LABELS: Record<string, React.ReactNode> = {
  '⇧': <ArrowBigUp size={18} strokeWidth={2} />,
  '⌫': <Delete size={18} strokeWidth={2} />,
  '↵': <CornerDownLeft size={18} strokeWidth={2} />,
  'Mic': <Mic size={18} strokeWidth={2} />,
}

interface KeyButtonProps {
  keyDef: KeyDef
  modState?: 'inactive' | 'latched' | 'locked'
  shiftActive?: boolean
  onKeyOutput: (value: string, special: boolean) => void
  onSlide: (dir: 'left' | 'right') => void
  edge?: 'left' | 'right'
}

const KeyButton: React.FC<KeyButtonProps> = ({ keyDef, modState, shiftActive, onKeyOutput, onSlide, edge }) => {
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
    } else if (keyDef.sub) {
      clearTimers()
      const subVal = keyDef.sub.s
      if (subVal) {
        timersRef.current.delay = setTimeout(() => {
          if (stateRef.current.isSliding || stateRef.current.didSlide) return
          stateRef.current.firedByRepeat = true
          onKeyOutput(subVal, isSpecialKey(subVal) || true)
        }, LONG_PRESS_DELAY)
      }
    }
  }, [keyDef, startLongPress, onKeyOutput, clearTimers])

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

    const availableDirs = keyDef.sub
      ? (Object.entries(keyDef.sub)
          .filter(([_, v]) => v)
          .map(([k]) => k) as SwipeDir[])
      : undefined
    const dir = getSwipeDirection(dx, dy, SWIPE_THRESHOLD, availableDirs)
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
      if (!s.didSlide && !s.firedByRepeat) fireKey(null)
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

  const displayLabel: React.ReactNode = (() => {
    if (keyDef.value === 'Shift' && modState === 'locked') return <ArrowBigUpDash size={18} strokeWidth={2} />
    if (keyDef.value === 'Shift' && modState === 'latched') return <ArrowBigUp size={18} strokeWidth={2.5} fill="currentColor" />
    if (keyDef.type === 'char' && shiftActive && keyDef.value.length === 1 && /^[a-z]$/.test(keyDef.value)) {
      return keyDef.value.toUpperCase()
    }
    return MAIN_LABELS[keyDef.label] ?? keyDef.label
  })()

  const renderSwipePreview = (content: React.ReactNode, compact = false) => (
    <div className="tk-swipe-preview">
      <span className={`tk-swipe-preview__content${compact ? ' tk-swipe-preview__content--compact' : ''}`}>
        {content}
      </span>
    </div>
  )

  return (
    <div
      className={classes}
      style={{ '--key-flex': keyDef.width ?? 1 } as React.CSSProperties}
      data-edge={edge}
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
            {DISPLAY_LABELS[sub] || sub}
          </span>
        )
      })}
      <span className={`tk-label${labelSmall ? ' tk-label--small' : ''}`}>{displayLabel}</span>
      {swipeSubVal && pressed && (
        renderSwipePreview(DISPLAY_LABELS[swipeSubVal] || swipeSubVal, swipeSubVal.length > 1)
      )}
      {sliding && (
        renderSwipePreview(<MoveHorizontal size={20} strokeWidth={2} />)
      )}
    </div>
  )
}

export default React.memo(KeyButton)
