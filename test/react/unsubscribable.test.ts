import { describe, expect, it, vi } from 'vitest';

import { unsubscribable } from '../../src/react/unsubscribable.ts';

describe('unsubscribable', () => {
  it('should call the callback after wrapper was called and correctly pass argumnets', () => {
    const f = vi.fn((a: number, b: string, c: string | undefined, d: boolean, e: boolean, g: number) => {
      return g * 2;
    });
    const { cb } = unsubscribable();
    const wrapped = cb(f);

    expect(wrapped).toBeDefined(); // fail if not defined
    if (!wrapped) return; // please linter

    expect(wrapped(1, '2', undefined, true, false, 6)).toBe(12);
    expect(f).toHaveBeenCalledWith(1, '2', undefined, true, false, 6);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('should not call the callback after unsubscribe even after you call wrapper', () => {
    const f = vi.fn();
    const { unsubscribe, cb } = unsubscribable();
    const wrapped = cb(f);
    unsubscribe();

    expect(wrapped).toBeDefined(); // fail if not defined
    if (!wrapped) return; // please linter

    wrapped();
    expect(f).not.toHaveBeenCalled();
  });

  it('should not call the callback when you unsubscribe before wrapping and after calling wrap', () => {
    const f = vi.fn();
    const { unsubscribe, cb } = unsubscribable();
    unsubscribe();
    const wrapped = cb(f);

    expect(wrapped).toBeDefined(); // fail if not defined
    if (!wrapped) return; // please linter

    wrapped();
    expect(f).not.toHaveBeenCalled();
  });
});
