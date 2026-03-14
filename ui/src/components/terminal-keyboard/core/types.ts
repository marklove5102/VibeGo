export type KeyType = 'char' | 'modifier' | 'action'

export interface SubKeys {
  nw?: string
  n?: string
  ne?: string
  w?: string
  e?: string
  sw?: string
  s?: string
  se?: string
}

export interface KeyDef {
  id: string
  label: string
  value: string
  type: KeyType
  width?: number
  sub?: SubKeys
  slider?: 'horizontal'
}

export interface RowDef {
  keys: KeyDef[]
  height?: number
}

export interface LayoutDef {
  name: string
  rows: RowDef[]
}

export interface TerminalKeyEvent {
  type: 'char' | 'key'
  value: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export interface ModifierState {
  active: boolean
  locked: boolean
}

export interface ModifiersState {
  ctrl: ModifierState
  alt: ModifierState
  shift: ModifierState
  meta: ModifierState
}

export const SPECIAL_KEYS = new Set([
  'Escape', 'Enter', 'Tab', 'Backspace', 'Delete', 'Insert',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Ctrl', 'Alt', 'Shift', 'Meta',
])

export const MODIFIER_KEYS = new Set(['Ctrl', 'Alt', 'Shift', 'Meta'])

export const SWIPE_DIRS = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'] as const
export type SwipeDir = typeof SWIPE_DIRS[number]

export function getSwipeDirection(dx: number, dy: number, threshold: number): SwipeDir | null {
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < threshold) return null
  const angle = Math.atan2(dy, dx)
  const sector = Math.round(angle / (Math.PI / 4))
  const normalized = ((sector % 8) + 8) % 8
  const dirs: SwipeDir[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']
  return dirs[normalized]
}

export function isSpecialKey(value: string): boolean {
  return SPECIAL_KEYS.has(value)
}
