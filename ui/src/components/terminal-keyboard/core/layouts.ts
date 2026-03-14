import type { LayoutDef } from '@/components/terminal-keyboard/core/types'

export const TERMINAL_QWERTY: LayoutDef = {
  name: 'Terminal QWERTY',
  rows: [
    {
      keys: [
        { id: 'q', label: 'Q', value: 'q', type: 'char', sub: { nw: '1' } },
        { id: 'w', label: 'W', value: 'w', type: 'char', sub: { nw: '2' } },
        { id: 'e', label: 'E', value: 'e', type: 'char', sub: { nw: '3' } },
        { id: 'r', label: 'R', value: 'r', type: 'char', sub: { nw: '4' } },
        { id: 't', label: 'T', value: 't', type: 'char', sub: { nw: '5' } },
        { id: 'y', label: 'Y', value: 'y', type: 'char', sub: { nw: '6' } },
        { id: 'u', label: 'U', value: 'u', type: 'char', sub: { nw: '7' } },
        { id: 'i', label: 'I', value: 'i', type: 'char', sub: { nw: '8' } },
        { id: 'o', label: 'O', value: 'o', type: 'char', sub: { nw: '9' } },
        { id: 'p', label: 'P', value: 'p', type: 'char', sub: { nw: '0' } },
      ],
    },
    {
      keys: [
        { id: 'a', label: 'A', value: 'a', type: 'char', sub: { nw: '-' } },
        { id: 's', label: 'S', value: 's', type: 'char', sub: { nw: '/' } },
        { id: 'd', label: 'D', value: 'd', type: 'char', sub: { nw: ':' } },
        { id: 'f', label: 'F', value: 'f', type: 'char', sub: { nw: ';' } },
        { id: 'g', label: 'G', value: 'g', type: 'char', sub: { nw: '(' } },
        { id: 'h', label: 'H', value: 'h', type: 'char', sub: { nw: ')' } },
        { id: 'j', label: 'J', value: 'j', type: 'char', sub: { nw: '~' } },
        { id: 'k', label: 'K', value: 'k', type: 'char', sub: { nw: '“' } },
        { id: 'l', label: 'L', value: 'l', type: 'char', sub: { nw: '”' } },
      ],
    },
    {
      keys: [
        { id: 'shift', label: '⇧', value: 'Shift', type: 'modifier', width: 1.5 },
        { id: 'z', label: 'Z', value: 'z', type: 'char', sub: { nw: '@' } },
        { id: 'x', label: 'X', value: 'x', type: 'char', sub: { nw: '.' } },
        { id: 'c', label: 'C', value: 'c', type: 'char', sub: { nw: '#' } },
        { id: 'v', label: 'V', value: 'v', type: 'char', sub: { nw: '`' } },
        { id: 'b', label: 'B', value: 'b', type: 'char', sub: { nw: '?' } },
        { id: 'n', label: 'N', value: 'n', type: 'char', sub: { nw: '!' } },
        { id: 'm', label: 'M', value: 'm', type: 'char', sub: { nw: '...' } },
        { id: 'bksp', label: '⌫', value: 'Backspace', type: 'action', width: 1.5 },
      ],
    },
    {
      keys: [
        { id: '123', label: '123', value: '123', type: 'action', width: 1.5 },
        { id: 'emoji', label: '😀', value: 'emoji', type: 'action', width: 1 },
        { id: 'comma', label: '，', value: ',', type: 'char', width: 1, sub: { nw: '。' } },
        { id: 'space', label: ' ', value: ' ', type: 'char', width: 3.5, slider: 'horizontal' },
        { id: 'lang', label: '中/英', value: 'lang', type: 'action', width: 1 },
        { id: 'enter', label: '发送', value: 'Enter', type: 'action', width: 2 },
      ],
    },
  ],
}
