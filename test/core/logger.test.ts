import { describe, expect, it } from 'vitest';

import { normalizeClientOptions } from '../../src/core/config.js';
import { LogContext, Logger, LogLevel, makeLogger } from '../../src/core/logger.js';

const defaultLogContext = { contextKey: 'contextValue' };

describe('logger', () => {
  it.each([
    [LogLevel.Trace, LogLevel.Trace, defaultLogContext],
    [LogLevel.Debug, LogLevel.Trace, defaultLogContext],
    [LogLevel.Info, LogLevel.Trace, defaultLogContext],
    [LogLevel.Warn, LogLevel.Trace, defaultLogContext],
    [LogLevel.Error, LogLevel.Trace, defaultLogContext],
    [LogLevel.Debug, LogLevel.Debug, defaultLogContext],
    [LogLevel.Info, LogLevel.Debug, defaultLogContext],
    [LogLevel.Warn, LogLevel.Debug, defaultLogContext],
    [LogLevel.Error, LogLevel.Debug, defaultLogContext],
    [LogLevel.Info, LogLevel.Info, defaultLogContext],
    [LogLevel.Warn, LogLevel.Info, defaultLogContext],
    [LogLevel.Error, LogLevel.Info, defaultLogContext],
    [LogLevel.Warn, LogLevel.Warn, defaultLogContext],
    [LogLevel.Error, LogLevel.Warn, defaultLogContext],
    [LogLevel.Error, LogLevel.Error, defaultLogContext],
    [LogLevel.Error, LogLevel.Error, undefined], // no context
  ])(
    `logs %s when configured level %s`,
    (logLevel: LogLevel, configuredLevel: LogLevel, logContext?: LogContext) =>
      new Promise((done, reject) => {
        const options = normalizeClientOptions({
          logLevel: configuredLevel,
          logHandler: (message: string, level: LogLevel, context?: LogContext) => {
            expect(message).toBe('test');
            expect(level).toBe(logLevel);
            expect(context).toEqual(logContext);
            done();
          },
        });

        const logger = makeLogger(options);
        callMethodForLevel(logger, logLevel, logContext);
        reject(new Error('Expected logHandler to be called'));
      }),
  );

  it.each([
    [LogLevel.Debug, LogLevel.Trace],
    [LogLevel.Info, LogLevel.Trace],
    [LogLevel.Warn, LogLevel.Trace],
    [LogLevel.Error, LogLevel.Trace],
    [LogLevel.Silent, LogLevel.Trace],
    [LogLevel.Info, LogLevel.Debug],
    [LogLevel.Warn, LogLevel.Debug],
    [LogLevel.Error, LogLevel.Debug],
    [LogLevel.Silent, LogLevel.Debug],
    [LogLevel.Warn, LogLevel.Info],
    [LogLevel.Error, LogLevel.Info],
    [LogLevel.Silent, LogLevel.Info],
    [LogLevel.Error, LogLevel.Warn],
    [LogLevel.Silent, LogLevel.Warn],
    [LogLevel.Silent, LogLevel.Error],
  ])(
    'does not log below the log level',
    (configuredLevel: LogLevel, logLevel: LogLevel) =>
      new Promise((done, reject) => {
        const options = normalizeClientOptions({
          logLevel: configuredLevel,
          logHandler: () => {
            reject(new Error('Expected logHandler to not be called'));
          },
        });

        const logger = makeLogger(options);
        callMethodForLevel(logger, logLevel);
        done();
      }),
  );
});

const callMethodForLevel = (log: Logger, level: Omit<LogLevel, 'silent'>, context?: object | undefined) => {
  switch (level) {
    case LogLevel.Trace:
      log.trace('test', context);
      break;
    case LogLevel.Debug:
      log.debug('test', context);
      break;
    case LogLevel.Info:
      log.info('test', context);
      break;
    case LogLevel.Warn:
      log.warn('test', context);
      break;
    case LogLevel.Error:
      log.error('test', context);
      break;
  }
};
