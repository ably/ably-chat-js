import { describe, expect, it } from 'vitest';

import { normaliseClientOptions } from '../src/config.js';
import { LogContext, LogLevel, makeLogger } from '../src/logger.js';

const defaultLogContext = { contextKey: 'contextValue' };

describe('logger', () => {
  it.each([
    [LogLevel.trace, LogLevel.trace, defaultLogContext],
    [LogLevel.debug, LogLevel.trace, defaultLogContext],
    [LogLevel.info, LogLevel.trace, defaultLogContext],
    [LogLevel.warn, LogLevel.trace, defaultLogContext],
    [LogLevel.error, LogLevel.trace, defaultLogContext],
    [LogLevel.debug, LogLevel.debug, defaultLogContext],
    [LogLevel.info, LogLevel.debug, defaultLogContext],
    [LogLevel.warn, LogLevel.debug, defaultLogContext],
    [LogLevel.error, LogLevel.debug, defaultLogContext],
    [LogLevel.info, LogLevel.info, defaultLogContext],
    [LogLevel.warn, LogLevel.info, defaultLogContext],
    [LogLevel.error, LogLevel.info, defaultLogContext],
    [LogLevel.warn, LogLevel.warn, defaultLogContext],
    [LogLevel.error, LogLevel.warn, defaultLogContext],
    [LogLevel.error, LogLevel.error, defaultLogContext],
    [LogLevel.error, LogLevel.error, undefined], // no context
  ])(
    `logs %s when configured level %s`,
    (logLevel: LogLevel, configuredLevel: LogLevel, logContext?: LogContext) =>
      new Promise((done, reject) => {
        const options = normaliseClientOptions({
          logLevel: configuredLevel,
          logHandler: (message: string, level: LogLevel, context?: LogContext) => {
            expect(message).toBe('test');
            expect(level).toBe(logLevel);
            expect(context).toEqual(logContext);
            done();
          },
        });

        const logger = makeLogger(options);
        logger[logLevel]('test', logContext);
        reject('Expected logHandler to be called');
      }),
  );

  it.each([
    [LogLevel.debug, LogLevel.trace],
    [LogLevel.info, LogLevel.trace],
    [LogLevel.warn, LogLevel.trace],
    [LogLevel.error, LogLevel.trace],
    [LogLevel.silent, LogLevel.trace],
    [LogLevel.info, LogLevel.debug],
    [LogLevel.warn, LogLevel.debug],
    [LogLevel.error, LogLevel.debug],
    [LogLevel.silent, LogLevel.debug],
    [LogLevel.warn, LogLevel.info],
    [LogLevel.error, LogLevel.info],
    [LogLevel.silent, LogLevel.info],
    [LogLevel.error, LogLevel.warn],
    [LogLevel.silent, LogLevel.warn],
    [LogLevel.silent, LogLevel.error],
  ])(
    'does not log below the log level',
    (configuredLevel: LogLevel, logLevel: LogLevel) =>
      new Promise((done, reject) => {
        const options = normaliseClientOptions({
          logLevel: configuredLevel,
          logHandler: () => {
            reject('Expected logHandler to not be called');
          },
        });

        const logger = makeLogger(options);
        logger[logLevel]('test');
        done();
      }),
  );
});
