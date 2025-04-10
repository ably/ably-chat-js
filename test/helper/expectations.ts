import * as Ably from 'ably';
import { expect } from 'vitest';

const extractExpectedKeys = (expected: unknown): Set<string> => {
  return new Set(Object.keys(expected as Ably.ErrorInfo));
};

const actualErrorInfo = (received: unknown, expected: unknown): Record<string, unknown> => {
  const commonKeys = extractExpectedKeys(expected);

  const returnVal = Object.fromEntries(
    [...commonKeys].map((key) => [key, (received as Ably.ErrorInfo)[key as keyof Ably.ErrorInfo]]),
  );

  if ((received as Ably.ErrorInfo).cause ?? (expected as Ably.ErrorInfo).cause) {
    returnVal.cause = actualErrorInfo(
      (received as Ably.ErrorInfo).cause ?? {},
      (expected as Ably.ErrorInfo).cause ?? {},
    ) as unknown as Ably.ErrorInfo;
  }

  return returnVal;
};

export interface ErrorInfoCompareType {
  code?: number;
  statusCode?: number;
  message?: string;
  cause?: ErrorInfoCompareType;
}

interface CheckResponseType {
  pass: boolean;
  message: () => string;
  expected: unknown;
  actual: unknown;
}

export const toBeErrorInfo = (received: unknown, expected: ErrorInfoCompareType): CheckResponseType => {
  if (!(received instanceof Ably.ErrorInfo)) {
    return {
      pass: false,
      message: () => `Expected ErrorInfo, found ${typeof received}`,
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
    expected: expected,
    actual: actualErrorInfo(received, expected),
  };
};

const toBeErrorInfoWithCode = (received: unknown, expected: number) => {
  return {
    pass: received instanceof Ably.ErrorInfo && received.code === expected,
    message: () => `Expected ErrorInfo with matching code`,
    expected: expected,
    actual: (received as Ably.ErrorInfo).code,
  };
};

expect.extend({
  toBeErrorInfo,
  toThrowErrorInfo(received: () => unknown, expected: ErrorInfoCompareType) {
    try {
      received();
    } catch (error: unknown) {
      return toBeErrorInfo(error, expected);
    }

    return {
      pass: false,
      message: () => `Expected ErrorInfo to be thrown`,
    };
  },
  toBeErrorInfoWithCode,
  toThrowErrorInfoWithCode(received: () => unknown, expected: number) {
    try {
      received();
    } catch (error: unknown) {
      return toBeErrorInfoWithCode(error, expected);
    }

    return {
      pass: false,
      message: () => `Expected ErrorInfo to be thrown`,
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
