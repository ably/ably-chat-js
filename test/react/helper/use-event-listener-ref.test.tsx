import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useEventListenerRef } from '../../../src/react/helper/use-event-listener-ref.js';

describe('useEventListenerRef', () => {
  it('should update the callback as it changes', () => {
    const originalCallback = vi.fn();
    const { result, rerender } = renderHook(({ callback }) => useEventListenerRef(callback), {
      initialProps: { callback: originalCallback },
    });

    (result.current as (arg0: string, arg1: string) => void)('arg1', 'arg2');
    expect(originalCallback).toHaveBeenCalledWith('arg1', 'arg2');

    const newCallback = vi.fn();
    rerender({ callback: newCallback });

    (result.current as (arg0: string, arg1: string) => void)('arg3', 'arg4');
    expect(newCallback).toHaveBeenCalledWith('arg3', 'arg4');
    expect(originalCallback).lastCalledWith('arg1', 'arg2');
  });

  it('should return handle undefined callbacks', () => {
    const { result } = renderHook(() => useEventListenerRef());

    (result.current as (arg0: string, arg1: string) => void)('arg3', 'arg4');
  });

  it('should return handle undefined callbacks becoming defined', () => {
    const { result, rerender } = renderHook(
      ({ callback }: { callback?: (arg0: string, arg1: string) => void }) => useEventListenerRef(callback),
      { initialProps: {} },
    );

    (result.current as (arg0: string, arg1: string) => void)('arg1', 'arg2');

    const newCallback: (arg0: string, arg1: string) => void = vi.fn();
    rerender({ callback: newCallback });

    (result.current as (arg0: string, arg1: string) => void)('arg3', 'arg4');
  });
});
