import * as Ably from 'ably';
import { expect } from 'vitest';

const extractCommonKeys = (received: unknown, expected: unknown): Set<string> => {
  const receivedKeys = new Set(Object.keys(received as Ably.ErrorInfo));
  const expectedKeys = new Set(Object.keys(expected as Ably.ErrorInfo));

  return new Set([...expectedKeys].filter((key) => receivedKeys.has(key)));
};

const actualErrorInfo = (received: unknown, expected: unknown): Record<string, unknown> => {
  const commonKeys = extractCommonKeys(received, expected);

  return Object.fromEntries(
    [...commonKeys].map((key) => [key, (received as Ably.ErrorInfo)[key as keyof Ably.ErrorInfo]]),
  );
};

const expectedErrorInfo = (received: unknown, expected: unknown): Record<string, unknown> => {
  const commonKeys = extractCommonKeys(received, expected);

  return Object.fromEntries(
    [...commonKeys].map((key) => [key, (expected as Ably.ErrorInfo)[key as keyof Ably.ErrorInfo]]),
  );
};

expect.extend({
  toBeErrorInfo(received: unknown, expected: { code?: number; statusCode?: number; message?: string }) {
    return {
      pass:
        received instanceof Ably.ErrorInfo &&
        (expected.code === undefined || received.code === expected.code) &&
        (expected.statusCode === undefined || received.statusCode === expected.statusCode) &&
        (expected.message === undefined || received.message === expected.message),
      message: () => {
        return `Expected matching ErrorInfo`;
      },
      expected: expectedErrorInfo(received, expected),
      actual: actualErrorInfo(received, expected),
    };
  },
  toBeErrorInfoWithCode(received: unknown, expected: number) {
    return {
      pass: received instanceof Ably.ErrorInfo && received.code === expected,
      message: () => `Expected ErrorInfo with matching code`,
      expected: expected,
      actual: (received as Ably.ErrorInfo).code,
    };
  },
});
