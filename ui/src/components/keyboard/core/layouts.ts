import type { LayoutDef } from '@/components/keyboard/core/types'

export const KEYBOARD_QWERTY: LayoutDef = {
  name: 'Keyboard QWERTY',
  rows: [
    {
      keys: [
        { id: 'q', label: 'q', value: 'q', type: 'char', sub: { ne: 'Escape', sw: '!' } },
        { id: 'w', label: 'w', value: 'w', type: 'char', sub: { ne: '~', sw: '@' } },
        { id: 'e', label: 'e', value: 'e', type: 'char', sub: { ne: '`', sw: '#' } },
        { id: 'r', label: 'r', value: 'r', type: 'char', sub: { ne: '^', sw: '$' } },
        { id: 't', label: 't', value: 't', type: 'char', sub: { ne: '%', sw: '&' } },
        { id: 'y', label: 'y', value: 'y', type: 'char', sub: { ne: '(', sw: ')' } },
        { id: 'u', label: 'u', value: 'u', type: 'char', sub: { ne: '<', sw: '>' } },
        { id: 'i', label: 'i', value: 'i', type: 'char', sub: { ne: '{', sw: '}' } },
        { id: 'o', label: 'o', value: 'o', type: 'char', sub: { ne: '[', sw: ']' } },
        { id: 'p', label: 'p', value: 'p', type: 'char', sub: { ne: '\\\\', sw: '|' } },
      ],
    },
    {
      keys: [
        { id: 'a', label: 'a', value: 'a', type: 'char', sub: { nw: 'Tab', se: 'Select' } },
        { id: 's', label: 's', value: 's', type: 'char', sub: { ne: '*' } },
        { id: 'd', label: 'd', value: 'd', type: 'char', sub: { ne: '/' } },
        { id: 'f', label: 'f', value: 'f', type: 'char', sub: { ne: '?' } },
        { id: 'g', label: 'g', value: 'g', type: 'char', sub: { ne: '-', sw: '_' } },
        { id: 'h', label: 'h', value: 'h', type: 'char', sub: { ne: '=', sw: '+' } },
        { id: 'j', label: 'j', value: 'j', type: 'char', sub: { ne: ':', sw: ';' } },
        { id: 'k', label: 'k', value: 'k', type: 'char', sub: { ne: '"', sw: '\'' } },
        { id: 'l', label: 'l', value: 'l', type: 'char', sub: { ne: 'Enter' } },
      ],
    },
    {
      keys: [
        { id: 'shift', label: '⇧', value: 'Shift', type: 'modifier', width: 1.5, sub: { ne: 'Caps' } },
        { id: 'z', label: 'z', value: 'z', type: 'char', sub: { se: 'Undo' } },
        { id: 'x', label: 'x', value: 'x', type: 'char', sub: { se: 'Cut' } },
        { id: 'c', label: 'c', value: 'c', type: 'char', sub: { sw: ',', se: 'Copy' } },
        { id: 'v', label: 'v', value: 'v', type: 'char', sub: { sw: '.', se: 'Paste' } },
        { id: 'b', label: 'b', value: 'b', type: 'char' },
        { id: 'n', label: 'n', value: 'n', type: 'char' },
        { id: 'm', label: 'm', value: 'm', type: 'char' },
        { id: 'bksp', label: '⌫', value: 'Backspace', type: 'action', width: 1.5, sub: { nw: 'Delete' } },
      ],
    },
    {
      keys: [
        { id: 'ctrl', label: 'Ctrl', value: 'Ctrl', type: 'modifier', width: 2.5, sub: { nw: 'Meta', sw: 'Clipboard', se: '123+' } },
        { id: 'alt', label: 'Alt', value: 'Alt', type: 'modifier', width: 1, sub: { nw: 'Fn', ne: 'Keyboard', sw: 'Emoji', se: 'Settings' } },
        { id: 'space', label: ' ', value: ' ', type: 'char', width: 2.5, slider: 'horizontal', sub: { s: 'Mic' } },
        { id: 'arrows', label: ' ', value: '', type: 'action', width: 1.5, sub: { n: 'ArrowUp', s: 'ArrowDown', w: 'ArrowLeft', e: 'ArrowRight' } },
        { id: 'enter', label: '完成', value: 'Enter', type: 'action', width: 2.5, sub: { ne: 'Enter' } },
      ],
    },
  ],
}
