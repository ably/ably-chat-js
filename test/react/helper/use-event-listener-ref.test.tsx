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

  it('should handle undefined callbacks gracefully and keep references constant', () => {
    type myfunc = (arg0: string, arg1: string) => void;

    // undefined at first
    const { result, rerender } = renderHook(
      ({ callback }: { callback?: myfunc}) => useEventListenerRef(callback),
      { initialProps: {} },
    );

    // current must be undefined
    expect(result.current === undefined).toBeTruthy();

    // set a real callback
    const callback1: myfunc = vi.fn();
    rerender({ callback: callback1 });
    const result1 = result.current;

    // expect callback to work and correctly propagate calls
    (result1 as myfunc)("arg1", "arg2");
    expect(callback1).toHaveBeenCalledWith("arg1", "arg2");

    // set to undefined
    rerender({ callback: undefined });
    expect(result.current === undefined).toBeTruthy();

    // set to a new callback
    const callback2: myfunc = vi.fn();
    rerender({ callback: callback2 });
    const result2 = result.current;

    // expect referential equality
    expect(result1 === result2).toBeTruthy();

    // expect callback to work and correctly propagate calls
    (result2 as myfunc)("arg3", "arg4");
    expect(callback2).toHaveBeenCalledWith("arg3", "arg4");
    expect(callback1).toHaveBeenCalledTimes(1); // callback1 should not have been called again
  });
});
