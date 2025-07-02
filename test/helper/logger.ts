import { onTestFailed } from 'vitest';

import { normalizeClientOptions } from '../../src/core/config.js';
import { consoleLogger, LogContext, Logger, LogLevel, makeLogger } from '../../src/core/logger.js';

// makeTestLogger creates a logger that logs at the level specified by the VITE_TEST_LOG_LEVEL environment variable.
export const makeTestLogger = (): Logger => {
  return makeLogger(
    normalizeClientOptions({
      logLevel: testLoggingLevel(),
      logHandler: testLogHandler(),
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

// testLogHandler returns a log handler that will collect logs and print them out when the test fails, if
// we're running on GitHub Actions.
export const testLogHandler = () => {
  // If we're not running on GitHub Actions, we don't need an explicit log handler... just do
  // whatever the default specified is.
  if (!process.env.GITHUB_ACTIONS) {
    return;
  }

  // If we're running on GitHub Actions, we'll collect logs and print them out when the test fails.
  const logs: {
    message: string;
    level: LogLevel;
    context?: LogContext;
  }[] = [];

  onTestFailed(({ task }) => {
    console.log(`FAILED TEST LOGS: ${task.file.name} ... ${task.name}\n`);
    for (const log of logs) {
      consoleLogger(log.message, log.level, log.context);
    }
  });

  return (message: string, level: LogLevel, context?: LogContext) => {
    logs.push({ message, level, context });
  };
};
