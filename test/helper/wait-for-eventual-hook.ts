import { expect, vi } from 'vitest';

export const waitForEventualHookValueToBeDefined = async <T>(
  result: { current: T },
  check: (value: T) => unknown,
): Promise<void> => {
  return vi.waitFor(
    () => {
      expect(check(result.current)).toBeDefined();
    },
    { timeout: 3000 },
  );
};

export const waitForEventualHookValue = async <HookReturn, Value>(
  result: { current: HookReturn },
  expected: Value,
  getValue: (current: HookReturn) => Value | undefined,
): Promise<void> => {
  return vi.waitFor(
    () => {
      expect(getValue(result.current)).toBe(expected);
    },
    { timeout: 3000 },
  );
};
