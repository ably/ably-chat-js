import { ClientOptions, normaliseClientOptions, NormalisedClientOptions } from '../../src/config.js';
import { LogLevel } from '../../src/logger.js';

const defaults: NormalisedClientOptions = {
  logLevel: LogLevel.Error,
};

export const testClientOptions = (options?: ClientOptions): NormalisedClientOptions => {
  options = options ?? defaults;
  return normaliseClientOptions(options);
};
