import { normaliseClientOptions } from '../../src/config.js';
import { Logger, LogLevel, makeLogger } from '../../src/logger.js';

// makeTestLogger creates a logger that logs at the level specified by the VITE_TEST_LOG_LEVEL environment variable.
export const makeTestLogger = (): Logger => {
  return makeLogger(
    normaliseClientOptions({
      logLevel: testLoggingLevel(),
    }),
  );
};

// testLoggingLevel returns the log level specified by the VITE_TEST_LOG_LEVEL environment variable.
export const testLoggingLevel = (): LogLevel | undefined => (process.env.VITE_TEST_LOG_LEVEL as LogLevel) ?? undefined;
