import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useStableReference } from '../../../src/react/helper/use-stable-reference.js';

describe('useStableReference', () => {
  it('creates a ref', () => {
    const originalCallback = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useStableReference(callback), {
      initialProps: { callback: originalCallback },
    });

    const initialResult = result.current;

    (result.current as (arg0: string, arg1: string) => void)('arg1', 'arg2');
    expect(originalCallback).toHaveBeenCalledWith('arg1', 'arg2');

    const newCallback = vi.fn();
    rerender({ callback: newCallback });

    (result.current as (arg0: string, arg1: string) => void)('arg3', 'arg4');
    expect(newCallback).toHaveBeenCalledWith('arg3', 'arg4');

    expect(result.current).toBe(initialResult);
  });
});
