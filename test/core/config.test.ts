import { describe, expect, it } from 'vitest';

import { normalizeClientOptions } from '../../src/core/config.ts';
import { LogLevel } from '../../src/core/logger.ts';

describe('config', () => {
  it('normalizes client options with no options', () => {
    expect(normalizeClientOptions()).toEqual({
      logLevel: LogLevel.Error,
      idempotentRestPublishing: false,
    });
  });

  it('normalizes client options with logLevel', () => {
    expect(normalizeClientOptions({ logLevel: LogLevel.Debug })).toEqual({
      logLevel: LogLevel.Debug,
      idempotentRestPublishing: false,
    });
  });

  it('normalizes client options with logHandler', () => {
    const logHandler = () => {};
    expect(normalizeClientOptions({ logHandler })).toEqual({
      logHandler,
      logLevel: LogLevel.Error,
      idempotentRestPublishing: false,
    });
  });

  it('normalizes client options with idempotentRestPublishing enabled', () => {
    expect(normalizeClientOptions({ idempotentRestPublishing: true })).toEqual({
      logLevel: LogLevel.Error,
      idempotentRestPublishing: true,
    });
  });
});
