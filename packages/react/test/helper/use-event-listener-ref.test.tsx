import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useEventListenerRef } from '../../src/helper/use-event-listener-ref.js';

describe('useEventListenerRef', () => {
  it('should update the callback as it changes', () => {
    const originalCallback = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useEventListenerRef(callback), {
      initialProps: { callback: originalCallback },
    });

    const initialResult = result.current;

    (result.current as (arg0: string, arg1: string) => void)('arg1', 'arg2');
    expect(originalCallback).toHaveBeenCalledWith('arg1', 'arg2');

    const newCallback = vi.fn();
    rerender({ callback: newCallback });

    (result.current as (arg0: string, arg1: string) => void)('arg3', 'arg4');
    expect(newCallback).toHaveBeenCalledWith('arg3', 'arg4');
    expect(originalCallback).lastCalledWith('arg1', 'arg2');

    expect(result.current).toBe(initialResult);
  });

  it('should return undefined for undefined callbacks ', () => {
    const { result } = renderHook(() => useEventListenerRef());
    expect(result.current).toBeUndefined();
  });

  it('should return handle undefined callbacks becoming defined and undefined', () => {
    const { result, rerender } = renderHook(
      ({ callback }: { callback?: (arg0: string, arg1: string) => void }) => useEventListenerRef(callback),
      { initialProps: {} },
    );

    // Callback starts as undefined
    expect(result.current).toBeUndefined();

    // Set a new callback, it should be called
    const callback1: (arg0: string, arg1: string) => void = vi.fn();
    rerender({ callback: callback1 });
    (result.current as (arg0: string, arg1: string) => void)('arg1', 'arg2');
    expect(callback1).toHaveBeenCalledWith('arg1', 'arg2');

    // Store reference to initial callback
    const initialCallback = result.current;

    // Go back to undefined
    rerender({ callback: undefined });
    expect(result.current).toBeUndefined();

    // Set a new callback, it should be called
    const callback2: (arg0: string, arg1: string) => void = vi.fn();
    rerender({ callback: callback2 });
    (result.current as (arg0: string, arg1: string) => void)('arg3', 'arg4');
    expect(callback2).toHaveBeenCalledWith('arg3', 'arg4');

    // When we inspect the result, it should be the same as the initial result
    console.log(result.current);
    expect(result.current).toBe(initialCallback);
  });
});
