import { describe, expect, it } from 'vitest';

import { normalizeClientOptions } from '../src/config.ts';
import { LogLevel } from '../src/logger.ts';

describe('config', () => {
  it('normalizes client options with no options', () => {
    expect(normalizeClientOptions()).toEqual({
      logLevel: LogLevel.Error,
    });
  });

  it('normalizes client options with logLevel', () => {
    expect(normalizeClientOptions({ logLevel: LogLevel.Debug })).toEqual({
      logLevel: LogLevel.Debug,
    });
  });

  it('normalizes client options with logHandler', () => {
    const logHandler = () => {};
    expect(normalizeClientOptions({ logHandler })).toEqual({
      logHandler,
      logLevel: LogLevel.Error,
    });
  });
});
