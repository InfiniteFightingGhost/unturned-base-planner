/**
 * Keyboard shortcut mapping and the single global binding hook.
 *
 * The mapping is pure and exhaustive: `matchShortcut` requires the modifiers to
 * match EXACTLY, so `Ctrl+Shift+Z` resolves to `redo` and never to `undo`. This
 * makes the table trivially unit-testable without a DOM.
 *
 * `useGlobalShortcuts` is the one keyboard authority for the editor. Context that
 * depends on the active tool (rotate the placement ghost while placing vs rotate
 * the selection otherwise) is resolved here, so controllers never double-handle
 * the same key.
 */

import { useEffect } from 'react';
import { editorStore } from '@/editor';
import { useEngineStore } from '@/engine';
import { useToolStore } from './toolStore';

export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'selectAll'
  | 'rotate'
  | 'rotateCounter'
  | 'escape'
  | 'view.perspective'
  | 'view.top'
  | 'view.front';

export interface ShortcutBinding {
  /** Lowercase `KeyboardEvent.key` value. */
  readonly key: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly action: ShortcutAction;
}

/** Minimal structural event shape, so tests can pass plain objects. */
export interface ShortcutEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

/** The canonical binding table (Ctrl and Cmd/meta are treated equivalently). */
export const SHORTCUTS: readonly ShortcutBinding[] = [
  { key: 'z', ctrl: true, action: 'undo' },
  { key: 'z', ctrl: true, shift: true, action: 'redo' },
  { key: 'y', ctrl: true, action: 'redo' },
  { key: 'c', ctrl: true, action: 'copy' },
  { key: 'v', ctrl: true, action: 'paste' },
  { key: 'd', ctrl: true, action: 'duplicate' },
  { key: 'a', ctrl: true, action: 'selectAll' },
  { key: 'delete', action: 'delete' },
  { key: 'backspace', action: 'delete' },
  { key: 'r', action: 'rotate' },
  { key: 'r', shift: true, action: 'rotateCounter' },
  { key: 'escape', action: 'escape' },
  { key: '1', action: 'view.perspective' },
  { key: '2', action: 'view.top' },
  { key: '3', action: 'view.front' },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Resolve an event to a shortcut action. Modifiers must match exactly; control
 * and meta (Cmd) are considered the same modifier. Returns `null` when nothing
 * matches.
 */
export function matchShortcut(
  event: ShortcutEvent,
  bindings: readonly ShortcutBinding[] = SHORTCUTS,
): ShortcutAction | null {
  const key = event.key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;

  for (const binding of bindings) {
    if (binding.key !== key) {
      continue;
    }
    if ((binding.ctrl ?? false) !== ctrl) {
      continue;
    }
    if ((binding.shift ?? false) !== event.shiftKey) {
      continue;
    }
    if ((binding.alt ?? false) !== event.altKey) {
      continue;
    }
    return binding.action;
  }
  return null;
}

const ROTATION_STEP = Math.PI / 2;
const PASTE_OFFSET: [number, number, number] = [1, 0, 1];
const DUPLICATE_OFFSET: [number, number, number] = [1, 0, 0];

function dispatch(action: ShortcutAction): void {
  const editor = editorStore.getState();
  switch (action) {
    case 'undo':
      editor.undo();
      break;
    case 'redo':
      editor.redo();
      break;
    case 'copy':
      editor.copy();
      break;
    case 'paste':
      editor.paste(PASTE_OFFSET);
      break;
    case 'duplicate':
      editor.duplicateSelected(DUPLICATE_OFFSET);
      break;
    case 'delete':
      editor.deleteSelected();
      break;
    case 'selectAll':
      editor.selectAll();
      break;
    case 'rotate':
    case 'rotateCounter': {
      const tool = useToolStore.getState();
      if (tool.activeTool === 'place') {
        const ghost = tool.ghost;
        if (ghost !== null) {
          const delta = action === 'rotate' ? -ROTATION_STEP : ROTATION_STEP;
          tool.setGhost({ position: ghost.position, rotationY: ghost.rotationY + delta });
        }
      } else {
        const delta = action === 'rotate' ? -ROTATION_STEP : ROTATION_STEP;
        editor.rotateSelected(delta);
      }
      break;
    }
    case 'escape':
      useToolStore.getState().cancelPlacement();
      editor.clearSelection();
      break;
    case 'view.perspective':
      useEngineStore.getState().setCameraMode('ORBIT');
      break;
    case 'view.top':
      useEngineStore.getState().setCameraMode('TOP_DOWN');
      break;
    case 'view.front':
      useEngineStore.getState().setCameraMode('FRONT');
      break;
  }
}

/** Bind the global shortcut table to `window`. Call once from the editor shell. */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) {
        return;
      }
      const action = matchShortcut(event);
      if (action === null) {
        return;
      }
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
