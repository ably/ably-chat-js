import { describe, expect, it, vi } from 'vitest';

vi.mock('ably');

import { realtimeExtras } from '../../src/core/realtime-extensions.ts';

describe('realtimeExtras', () => {
  it('returns empty object for undefined', () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(realtimeExtras(undefined)).toEqual({});
  });

  it('returns empty object for null', () => {
    expect(realtimeExtras(null)).toEqual({});
  });

  it('returns empty object for non-object values', () => {
    expect(realtimeExtras(42)).toEqual({});
    expect(realtimeExtras('string')).toEqual({});
    expect(realtimeExtras(true)).toEqual({});
  });

  it('extracts userClaim when it is a string', () => {
    expect(realtimeExtras({ userClaim: 'claim-value' })).toEqual({
      userClaim: 'claim-value',
    });
  });

  it('drops userClaim when it is not a string', () => {
    expect(realtimeExtras({ userClaim: 123 })).toEqual({});
    expect(realtimeExtras({ userClaim: true })).toEqual({});
    expect(realtimeExtras({ userClaim: {} })).toEqual({});
    expect(realtimeExtras({ userClaim: ['array'] })).toEqual({});
  });

  it('extracts headers when present', () => {
    const headers = { key: 'value' };
    expect(realtimeExtras({ headers })).toEqual({ headers });
  });

  it('extracts both headers and userClaim', () => {
    const extras = { headers: { key: 'value' }, userClaim: 'claim-value' };
    expect(realtimeExtras(extras)).toEqual({
      headers: { key: 'value' },
      userClaim: 'claim-value',
    });
  });

  it('returns empty object with no keys for empty object input', () => {
    const result = realtimeExtras({});
    expect(result).toEqual({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('does not include undefined keys in result', () => {
    const result = realtimeExtras({ userClaim: 123, headers: null });
    expect(Object.keys(result)).toHaveLength(0);
  });
});
