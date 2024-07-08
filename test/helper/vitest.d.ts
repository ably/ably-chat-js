/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-interface */
import type { Assertion, AsymmetricMatchersContaining } from 'vitest';

import type { errorInfoCompareType } from './expectations.ts';

interface CustomMatchers<R = unknown> {
  toBeErrorInfoWithCode: (code: number) => R;
  toBeErrorInfoWithCauseCode: (code: number) => R;
  toBeErrorInfo: (params: errorInfoCompareType) => R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
