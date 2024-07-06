import * as Ably from 'ably';
import { expect } from 'vitest';

const extractCommonKeys = (received: unknown, expected: unknown): Set<string> => {
  const receivedKeys = new Set(Object.keys(received as Ably.ErrorInfo));
  const expectedKeys = new Set(Object.keys(expected as Ably.ErrorInfo));

  return new Set([...expectedKeys].filter((key) => receivedKeys.has(key)));
};

const actualErrorInfo = (received: unknown, expected: unknown): Record<string, unknown> => {
  const commonKeys = extractCommonKeys(received, expected);

  const returnVal = Object.fromEntries(
    [...commonKeys].map((key) => [key, (received as Ably.ErrorInfo)[key as keyof Ably.ErrorInfo]]),
  );

  if ((received as Ably.ErrorInfo).cause) {
    returnVal.cause = actualErrorInfo(
      (received as Ably.ErrorInfo).cause,
      (expected as Ably.ErrorInfo).cause,
    ) as unknown as Ably.ErrorInfo;
  }

  return returnVal;
};

const expectedErrorInfo = (received: unknown, expected: unknown): Record<string, unknown> => {
  const commonKeys = extractCommonKeys(received, expected);

  return Object.fromEntries(
    [...commonKeys].map((key) => [key, (expected as Ably.ErrorInfo)[key as keyof Ably.ErrorInfo]]),
  );
};

export interface errorInfoCompareType {
  code?: number;
  statusCode?: number;
  message?: string;
  cause?: errorInfoCompareType;
}

interface checkResponseType {
  pass: boolean;
  message: () => string;
  expected: unknown;
  actual: unknown;
}

const toBeErrorInfo = (received: unknown, expected: errorInfoCompareType): checkResponseType => {
  if (!(received instanceof Ably.ErrorInfo)) {
    return {
      pass: false,
      message: () => `Expected ErrorInfo`,
      expected: expected,
      actual: received,
    };
  }

  const codeMatch = expected.code === undefined || received.code === expected.code;
  const statusCodeMatch = expected.statusCode === undefined || received.statusCode === expected.statusCode;
  const messageMatch = expected.message === undefined || received.message === expected.message;
  const causeMatch = expected.cause === undefined || toBeErrorInfo(received.cause, expected.cause).pass;

  return {
    pass: causeMatch && codeMatch && statusCodeMatch && messageMatch,
    message: () => {
      return `Expected matching ErrorInfo`;
    },
    expected: expectedErrorInfo(received, expected),
    actual: actualErrorInfo(received, expected),
  };
};

expect.extend({
  toBeErrorInfo,
  toBeErrorInfoWithCode(received: unknown, expected: number) {
    return {
      pass: received instanceof Ably.ErrorInfo && received.code === expected,
      message: () => `Expected ErrorInfo with matching code`,
      expected: expected,
      actual: (received as Ably.ErrorInfo).code,
    };
  },
  toBeErrorInfoWithCauseCode(received: unknown, expected: number) {
    return {
      pass:
        received instanceof Ably.ErrorInfo &&
        received.cause instanceof Ably.ErrorInfo &&
        received.cause.code === expected,
      message: () => `Expected ErrorInfo with matching cause status code`,
      expected: expected,
      actual:
        received instanceof Ably.ErrorInfo && received.cause instanceof Ably.ErrorInfo
          ? received.cause.code
          : undefined,
    };
  },
});
