import type { LayoutDef } from '@/components/keyboard/core/types'

export const KEYBOARD_QWERTY: LayoutDef = {
  name: 'Keyboard QWERTY',
  rows: [
    {
      keys: [
        { id: 'q', label: 'q', value: 'q', type: 'char', sub: { sw: 'Escape' } },
        { id: 'w', label: 'w', value: 'w', type: 'char', sub: { nw: '~' } },
        { id: 'e', label: 'e', value: 'e', type: 'char' },
        { id: 'r', label: 'r', value: 'r', type: 'char' },
        { id: 't', label: 't', value: 't', type: 'char' },
        { id: 'y', label: 'y', value: 'y', type: 'char', sub: { se: 'Enter' } },
        { id: 'u', label: 'u', value: 'u', type: 'char' },
        { id: 'i', label: 'i', value: 'i', type: 'char' },
        { id: 'o', label: 'o', value: 'o', type: 'char' },
        { id: 'p', label: 'p', value: 'p', type: 'char' },
      ],
    },
    {
      keys: [
        { id: 'a', label: 'a', value: 'a', type: 'char', sub: { nw: 'Tab', se: 'Select' } },
        { id: 's', label: 's', value: 's', type: 'char', sub: { nw: '`' } },
        { id: 'd', label: 'd', value: 'd', type: 'char' },
        { id: 'f', label: 'f', value: 'f', type: 'char' },
        { id: 'g', label: 'g', value: 'g', type: 'char', sub: { sw: '_', ne: '-' } },
        { id: 'h', label: 'h', value: 'h', type: 'char', sub: { sw: '+', ne: '=' } },
        { id: 'j', label: 'j', value: 'j', type: 'char', sub: { sw: '{', se: '}' } },
        { id: 'k', label: 'k', value: 'k', type: 'char', sub: { sw: '[', se: ']' } },
        { id: 'l', label: 'l', value: 'l', type: 'char', sub: { sw: '\\', ne: '|' } },
      ],
    },
    {
      keys: [
        { id: 'shift', label: '⇧', value: 'Shift', type: 'modifier', width: 1.5, sub: { ne: 'Caps' } },
        { id: 'z', label: 'z', value: 'z', type: 'char', sub: { se: 'Undo' } },
        { id: 'x', label: 'x', value: 'x', type: 'char', sub: { se: 'Cut' } },
        { id: 'c', label: 'c', value: 'c', type: 'char', sub: { sw: ',', ne: '<', se: 'Copy' } },
        { id: 'v', label: 'v', value: 'v', type: 'char', sub: { sw: '.', ne: '>', se: 'Paste' } },
        { id: 'b', label: 'b', value: 'b', type: 'char', sub: { sw: '/', ne: '?' } },
        { id: 'n', label: 'n', value: 'n', type: 'char', sub: { sw: ';', ne: ':' } },
        { id: 'm', label: 'm', value: 'm', type: 'char', sub: { sw: '\'', ne: '"' } },
        { id: 'bksp', label: '⌫', value: 'Backspace', type: 'action', width: 1.5, sub: { ne: 'Delete' } },
      ],
    },
    {
      keys: [
        { id: 'ctrl', label: 'Ctrl', value: 'Ctrl', type: 'modifier', width: 2.5, sub: { nw: 'Meta', sw: 'Clipboard', se: '123+' } },
        { id: 'fn', label: 'Fn', value: 'Fn', type: 'modifier', width: 1, sub: { nw: 'Alt', ne: 'Keyboard', sw: 'Emoji', se: 'Settings' } },
        { id: 'space', label: ' ', value: ' ', type: 'char', width: 2.5, slider: 'horizontal' },
        { id: 'arrows', label: '⌖', value: '', type: 'action', width: 1.5, sub: { n: 'ArrowUp', s: 'ArrowDown', w: 'ArrowLeft', e: 'ArrowRight' } },
        { id: 'enter', label: '完成', value: 'Enter', type: 'action', width: 2.5, sub: { nw: 'Mic', ne: 'Enter' } },
      ],
    },
  ],
}
