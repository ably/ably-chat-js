import { normalizeClientOptions } from '../../src/config.js';
import { Logger, LogLevel, makeLogger } from '../../src/logger.js';

// makeTestLogger creates a logger that logs at the level specified by the VITE_TEST_LOG_LEVEL environment variable.
export const makeTestLogger = (): Logger => {
  return makeLogger(
    normalizeClientOptions({
      logLevel: testLoggingLevel(),
    }),
  );
};

// testLoggingLevel returns the log level specified by the VITE_TEST_LOG_LEVEL environment variable.
export const testLoggingLevel = (): LogLevel => {
  const level = process.env.VITE_TEST_LOG_LEVEL;

  if (level) {
    return level as LogLevel;
  }

  return LogLevel.Silent;
};
