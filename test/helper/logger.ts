import { Logger, LogLevel, makeLogger } from '../../src/logger.js';

// makeTestLogger creates a logger that logs at the level specified by the VITE_TEST_LOG_LEVEL environment variable.
export const makeTestLogger = (): Logger => {
  return makeLogger({ logLevel: testLoggingLevel(), typingTimeoutMs: 1000 });
};

// testLoggingLevel returns the log level specified by the VITE_TEST_LOG_LEVEL environment variable.
export const testLoggingLevel = (): LogLevel => process.env.VITE_TEST_LOG_LEVEL as LogLevel;
