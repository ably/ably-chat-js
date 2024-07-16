import { ClientOptions, normalizeClientOptions, NormalizedClientOptions } from '../../src/core/config.js';
import { LogLevel } from '../../src/core/logger.js';

const defaults: NormalizedClientOptions = {
  logLevel: LogLevel.Error,
};

export const testClientOptions = (options?: ClientOptions): NormalizedClientOptions => {
  options = options ?? defaults;
  return normalizeClientOptions(options);
};
