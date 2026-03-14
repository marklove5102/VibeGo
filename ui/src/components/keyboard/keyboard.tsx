import React, { useState, useCallback, useMemo } from 'react'
import type { KeyEvent, ModifiersState, LayoutDef } from '@/components/keyboard/core/types'
import { MODIFIER_KEYS } from '@/components/keyboard/core/types'
import { KEYBOARD_QWERTY } from '@/components/keyboard/core/layouts'
import KeyButton from '@/components/keyboard/key-button'
import '@/components/keyboard/keyboard.css'

interface KeyboardProps {
  onKeyEvent: (event: KeyEvent) => void
  layout?: LayoutDef
}

const INITIAL_MOD = { active: false, locked: false }

const Keyboard: React.FC<KeyboardProps> = ({
  onKeyEvent,
  layout = KEYBOARD_QWERTY,
}) => {
  const [modifiers, setModifiers] = useState<ModifiersState>({
    ctrl: { ...INITIAL_MOD },
    alt: { ...INITIAL_MOD },
    shift: { ...INITIAL_MOD },
    meta: { ...INITIAL_MOD },
  })

  const modName = useCallback((value: string): keyof ModifiersState | null => {
    const map: Record<string, keyof ModifiersState> = {
      Ctrl: 'ctrl', Alt: 'alt', Shift: 'shift', Meta: 'meta',
    }
    return map[value] ?? null
  }, [])

  const clearLatched = useCallback(() => {
    setModifiers(prev => {
      const next = { ...prev }
      let changed = false
      for (const k of ['ctrl', 'alt', 'shift', 'meta'] as const) {
        if (prev[k].active && !prev[k].locked) {
          next[k] = { active: false, locked: false }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [])

  const handleKeyOutput = useCallback((value: string, special: boolean) => {
    if (MODIFIER_KEYS.has(value)) {
      const name = modName(value)
      if (!name) return
      setModifiers(prev => {
        const cur = prev[name]
        let next: { active: boolean; locked: boolean }
        if (!cur.active) {
          next = { active: true, locked: false }
        } else if (!cur.locked) {
          next = { active: true, locked: true }
        } else {
          next = { active: false, locked: false }
        }
        return { ...prev, [name]: next }
      })
      return
    }

    const event: KeyEvent = {
      type: special ? 'key' : 'char',
      value,
      ctrl: modifiers.ctrl.active,
      alt: modifiers.alt.active,
      shift: modifiers.shift.active,
      meta: modifiers.meta.active,
    }
    onKeyEvent(event)
    clearLatched()
  }, [modifiers, onKeyEvent, clearLatched, modName])

  const handleSlide = useCallback((dir: 'left' | 'right') => {
    const event: KeyEvent = {
      type: 'key',
      value: dir === 'left' ? 'ArrowLeft' : 'ArrowRight',
      ctrl: modifiers.ctrl.active,
      alt: modifiers.alt.active,
      shift: modifiers.shift.active,
      meta: modifiers.meta.active,
    }
    onKeyEvent(event)
  }, [modifiers, onKeyEvent])

  const getModState = useCallback((value: string): 'inactive' | 'latched' | 'locked' => {
    const name = modName(value)
    if (!name) return 'inactive'
    const m = modifiers[name]
    if (m.locked) return 'locked'
    if (m.active) return 'latched'
    return 'inactive'
  }, [modifiers, modName])

  const shiftActive = modifiers.shift.active

  const rowClasses = useMemo(() => {
    return layout.rows.map(row => {
      let c = 'tk-row'
      if (row.height && row.height < 1) c += ' tk-row--short'
      if (row.height && row.height > 1) c += ' tk-row--tall'
      return c
    })
  }, [layout])

  return (
    <div className="tk-keyboard">
      {layout.rows.map((row, ri) => (
        <div key={ri} className={rowClasses[ri]}>
          {row.keys.map((keyDef, ki) => {
            let edge: 'left' | 'right' | undefined
            if (ki === 0) edge = 'left'
            else if (ki === row.keys.length - 1) edge = 'right'

            return (
              <KeyButton
                key={keyDef.id}
                keyDef={keyDef}
                modState={keyDef.type === 'modifier' ? getModState(keyDef.value) : undefined}
                shiftActive={shiftActive}
                onKeyOutput={handleKeyOutput}
                onSlide={handleSlide}
                edge={edge}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default Keyboard
