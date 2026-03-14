import type { LayoutDef } from './types'

const W = 10 / 11

export const TERMINAL_QWERTY: LayoutDef = {
  name: 'Terminal QWERTY',
  rows: [
    {
      height: 0.85,
      keys: [
        { id: 'esc', label: 'Esc', value: 'Escape', type: 'action', width: W, sub: { ne: '~', se: '`' } },
        { id: '1', label: '1', value: '1', type: 'char', width: W, sub: { ne: 'F1', sw: '!' } },
        { id: '2', label: '2', value: '2', type: 'char', width: W, sub: { ne: 'F2', sw: '@' } },
        { id: '3', label: '3', value: '3', type: 'char', width: W, sub: { ne: 'F3', sw: '#' } },
        { id: '4', label: '4', value: '4', type: 'char', width: W, sub: { ne: 'F4', sw: '$' } },
        { id: '5', label: '5', value: '5', type: 'char', width: W, sub: { ne: 'F5', sw: '%' } },
        { id: '6', label: '6', value: '6', type: 'char', width: W, sub: { ne: 'F6', sw: '^' } },
        { id: '7', label: '7', value: '7', type: 'char', width: W, sub: { ne: 'F7', sw: '&' } },
        { id: '8', label: '8', value: '8', type: 'char', width: W, sub: { ne: 'F8', sw: '*' } },
        { id: '9', label: '9', value: '9', type: 'char', width: W, sub: { ne: 'F9', sw: '(' } },
        { id: '0', label: '0', value: '0', type: 'char', width: W, sub: { ne: 'F10', sw: ')' } },
      ],
    },
    {
      keys: [
        { id: 'q', label: 'q', value: 'q', type: 'char', sub: { ne: '`', sw: '~' } },
        { id: 'w', label: 'w', value: 'w', type: 'char', sub: { ne: '!', sw: '@' } },
        { id: 'e', label: 'e', value: 'e', type: 'char', sub: { ne: '#', sw: '€' } },
        { id: 'r', label: 'r', value: 'r', type: 'char', sub: { ne: '$' } },
        { id: 't', label: 't', value: 't', type: 'char', sub: { ne: '%' } },
        { id: 'y', label: 'y', value: 'y', type: 'char', sub: { ne: '^' } },
        { id: 'u', label: 'u', value: 'u', type: 'char', sub: { ne: '&' } },
        { id: 'i', label: 'i', value: 'i', type: 'char', sub: { ne: '*' } },
        { id: 'o', label: 'o', value: 'o', type: 'char', sub: { ne: '(', sw: ')' } },
        { id: 'p', label: 'p', value: 'p', type: 'char', sub: { ne: '_', sw: '-' } },
      ],
    },
    {
      keys: [
        { id: 'a', label: 'a', value: 'a', type: 'char', sub: { ne: 'Tab', nw: '`' } },
        { id: 's', label: 's', value: 's', type: 'char', sub: { ne: '|', sw: '\\' } },
        { id: 'd', label: 'd', value: 'd', type: 'char', sub: { ne: '{', sw: '[' } },
        { id: 'f', label: 'f', value: 'f', type: 'char', sub: { ne: '}', sw: ']' } },
        { id: 'g', label: 'g', value: 'g', type: 'char', sub: { ne: '-', sw: '_' } },
        { id: 'h', label: 'h', value: 'h', type: 'char', sub: { ne: '=', sw: '+' } },
        { id: 'j', label: 'j', value: 'j', type: 'char', sub: { ne: ';', sw: ':' } },
        { id: 'k', label: 'k', value: 'k', type: 'char', sub: { ne: "'", sw: '"' } },
        { id: 'l', label: 'l', value: 'l', type: 'char', sub: { ne: '|', sw: '\\' } },
      ],
    },
    {
      keys: [
        { id: 'shift', label: '⇧', value: 'Shift', type: 'modifier', width: 1.5 },
        { id: 'z', label: 'z', value: 'z', type: 'char', sub: { ne: '~' } },
        { id: 'x', label: 'x', value: 'x', type: 'char', sub: { ne: '!' } },
        { id: 'c', label: 'c', value: 'c', type: 'char', sub: { ne: '<', sw: '.' } },
        { id: 'v', label: 'v', value: 'v', type: 'char', sub: { ne: '>', sw: ',' } },
        { id: 'b', label: 'b', value: 'b', type: 'char', sub: { ne: '?', sw: '/' } },
        { id: 'n', label: 'n', value: 'n', type: 'char', sub: { ne: ':', sw: ';' } },
        { id: 'm', label: 'm', value: 'm', type: 'char', sub: { ne: '"', sw: "'" } },
        { id: 'bksp', label: '⌫', value: 'Backspace', type: 'action', width: 1.5, sub: { ne: 'Delete' } },
      ],
    },
    {
      height: 1.05,
      keys: [
        { id: 'ctrl', label: 'Ctrl', value: 'Ctrl', type: 'modifier', width: 1.5 },
        { id: 'alt', label: 'Alt', value: 'Alt', type: 'modifier', width: 1.2 },
        { id: 'space', label: ' ', value: ' ', type: 'char', width: 4.3, slider: 'horizontal' },
        {
          id: 'nav', label: '◆', value: 'ArrowDown', type: 'action', width: 1.5,
          sub: {
            n: 'ArrowUp', s: 'ArrowDown', w: 'ArrowLeft', e: 'ArrowRight',
            nw: 'Home', ne: 'PageUp', sw: 'End', se: 'PageDown',
          },
        },
        { id: 'enter', label: '↵', value: 'Enter', type: 'action', width: 1.5, sub: { ne: 'Insert' } },
      ],
    },
  ],
}
