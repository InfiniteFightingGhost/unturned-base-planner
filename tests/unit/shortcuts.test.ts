import { describe, expect, it } from 'vitest';
import { matchShortcut, SHORTCUTS } from '@/editor/tools/shortcuts';
import type { ShortcutEvent } from '@/editor/tools/shortcuts';

function event(key: string, overrides: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...overrides,
  };
}

describe('matchShortcut', () => {
  it('resolves undo, redo and redo-by-Y', () => {
    expect(matchShortcut(event('z', { ctrlKey: true }))).toBe('undo');
    expect(matchShortcut(event('z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(matchShortcut(event('y', { ctrlKey: true }))).toBe('redo');
  });

  it('requires modifiers to match exactly (ctrl+shift+z is not undo)', () => {
    expect(matchShortcut(event('z', { ctrlKey: true, shiftKey: true }))).not.toBe('undo');
    expect(matchShortcut(event('z', { ctrlKey: true }))).not.toBe('redo');
  });

  it('resolves clipboard, duplicate, delete and escape actions', () => {
    expect(matchShortcut(event('c', { ctrlKey: true }))).toBe('copy');
    expect(matchShortcut(event('v', { ctrlKey: true }))).toBe('paste');
    expect(matchShortcut(event('d', { ctrlKey: true }))).toBe('duplicate');
    expect(matchShortcut(event('Delete'))).toBe('delete');
    expect(matchShortcut(event('Backspace'))).toBe('delete');
    expect(matchShortcut(event('Escape'))).toBe('escape');
  });

  it('resolves rotate and counter-rotate', () => {
    expect(matchShortcut(event('r'))).toBe('rotate');
    expect(matchShortcut(event('r', { shiftKey: true }))).toBe('rotateCounter');
  });

  it('resolves camera view digits', () => {
    expect(matchShortcut(event('1'))).toBe('view.perspective');
    expect(matchShortcut(event('2'))).toBe('view.top');
    expect(matchShortcut(event('3'))).toBe('view.front');
  });

  it('treats meta (Cmd) as control', () => {
    expect(matchShortcut(event('z', { metaKey: true }))).toBe('undo');
  });

  it('returns null for unbound keys', () => {
    expect(matchShortcut(event('q'))).toBeNull();
    expect(matchShortcut(event('z', { altKey: true }))).toBeNull();
  });

  it('exposes a non-empty binding table with unique key+modifier combinations', () => {
    expect(SHORTCUTS.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const binding of SHORTCUTS) {
      const signature = `${binding.key}|${binding.ctrl ?? false}|${binding.shift ?? false}|${binding.alt ?? false}`;
      expect(seen.has(signature)).toBe(false);
      seen.add(signature);
    }
  });
});
