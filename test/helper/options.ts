import { ClientOptions, normaliseClientOptions, NormalisedClientOptions } from '../../src/config.js';
import { LogLevel } from '../../src/logger.js';

const defaults: NormalisedClientOptions = {
  typingTimeoutMs: 5000,
  logLevel: LogLevel.error,
};

export const testClientOptions = (options?: ClientOptions): NormalisedClientOptions => {
  options = options ?? defaults;
  return normaliseClientOptions(options);
};
