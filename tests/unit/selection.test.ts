import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, applySelection, isSelected, selectAll } from '@/editor';

describe('selection reducer', () => {
  it('replace ignores the current selection and de-dupes incoming', () => {
    expect(applySelection(['a', 'b'], ['c', 'c', 'b'], 'replace')).toEqual(['c', 'b']);
  });

  it('replace with empty incoming clears the selection', () => {
    expect(applySelection(['a', 'b'], [], 'replace')).toEqual([]);
  });

  it('add keeps current order then appends new ids in incoming order', () => {
    expect(applySelection(['a', 'b'], ['b', 'c', 'a', 'd'], 'add')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('add is order-stable and ignores duplicates already present', () => {
    expect(applySelection(['b', 'a'], ['a', 'b'], 'add')).toEqual(['b', 'a']);
  });

  it('toggle adds unselected and removes selected ids', () => {
    expect(applySelection(['a', 'b'], ['b', 'c'], 'toggle')).toEqual(['a', 'c']);
  });

  it('toggle de-dupes current and is stable on repeated ids', () => {
    expect(applySelection(['a', 'a', 'b'], ['a', 'a'], 'toggle')).toEqual(['a', 'b']);
  });

  it('toggle duplicate inside incoming cancels out', () => {
    expect(applySelection(['a'], ['b', 'b'], 'toggle')).toEqual(['a']);
  });

  it('subtract removes incoming ids and ignores unknown ones', () => {
    expect(applySelection(['a', 'b', 'c'], ['b', 'z'], 'subtract')).toEqual(['a', 'c']);
  });

  it('subtract de-dupes the current selection', () => {
    expect(applySelection(['a', 'a', 'b'], ['b'], 'subtract')).toEqual(['a']);
  });

  it('all modes tolerate an undefined-ish duplicate incoming list', () => {
    for (const mode of ['replace', 'add', 'toggle', 'subtract'] as const) {
      expect(applySelection(['x'], ['x', 'x'], mode)).toBeDefined();
    }
  });

  it('isSelected reports membership', () => {
    expect(isSelected(['a', 'b'], 'b')).toBe(true);
    expect(isSelected(['a', 'b'], 'c')).toBe(false);
  });

  it('selectAll de-dupes while preserving order', () => {
    expect(selectAll(['c', 'a', 'c', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('EMPTY_SELECTION is empty and frozen', () => {
    expect(EMPTY_SELECTION).toEqual([]);
    expect(Object.isFrozen(EMPTY_SELECTION)).toBe(true);
  });
});
