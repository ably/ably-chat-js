/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */

import type { Assertion, AsymmetricMatchersContaining } from 'vitest';

import type { ErrorInfoCompareType } from './expectations.ts';

interface CustomMatchers<R = unknown> {
  toBeErrorInfoWithCode: (code: number) => R;
  toBeErrorInfoWithCauseCode: (code: number) => R;
  toBeErrorInfo: (params: ErrorInfoCompareType) => R;
  toThrowErrorInfo: (params: ErrorInfoCompareType) => R;
  toThrowErrorInfoWithCode: (code: number) => R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}

  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
