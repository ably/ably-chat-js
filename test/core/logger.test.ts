import { describe, expect, it, vi } from 'vitest';

import { normalizeClientOptions } from '../../src/core/config.ts';
import { ErrorCode } from '../../src/core/errors.ts';
import { LogContext, Logger, LogLevel, makeLogger } from '../../src/core/logger.ts';

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

  it('throws exception on invalid log level', () => {
    expect(() => makeLogger({ logLevel: 'invalid' as LogLevel })).toThrowErrorInfo({
      message: 'unable to create logger; invalid log level: invalid',
      statusCode: 400,
      code: ErrorCode.InvalidArgument,
    });
  });
});

describe('withContext', () => {
  it('creates new logger with merged context', () =>
    new Promise<void>((done) => {
      const baseContext = { baseKey: 'baseValue', sharedKey: 'baseSharedValue' };
      const newContext = { newKey: 'newValue', sharedKey: 'newSharedValue' };

      const handler = (message: string, level: LogLevel, context?: LogContext) => {
        expect(context).toEqual({
          baseKey: 'baseValue',
          newKey: 'newValue',
          sharedKey: 'newSharedValue', // New context overrides base context
        });
        expect(level).toBe(LogLevel.Debug);
        expect(message).toBe('test message');
        done();
      };

      const baseLogger = makeLogger(
        normalizeClientOptions({
          logLevel: LogLevel.Debug,
          logHandler: handler,
        }),
      );
      const newLogger = baseLogger.withContext(baseContext).withContext(newContext);

      newLogger.debug('test message');
    }));

  it('maintains original log level', () => {
    const handler = vi.fn();
    const baseLogger = makeLogger(
      normalizeClientOptions({
        logLevel: LogLevel.Warn,
        logHandler: handler,
      }),
    );
    const newLogger = baseLogger.withContext({ key: 'value' });

    newLogger.debug('should not log'); // Below warn level
    newLogger.warn('should log');
    newLogger.error('should log');

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('handles undefined base context', () =>
    new Promise<void>((done) => {
      const newContext = { key: 'value' };

      const handler = (message: string, level: LogLevel, context?: LogContext) => {
        expect(context).toEqual(newContext);
        done();
      };

      const baseLogger = makeLogger(
        normalizeClientOptions({
          logLevel: LogLevel.Debug,
          logHandler: handler,
        }),
      );
      const newLogger = baseLogger.withContext(newContext);

      newLogger.debug('test message');
    }));
});

const callMethodForLevel = (log: Logger, level: Omit<LogLevel, 'silent'>, context?: object) => {
  switch (level) {
    case LogLevel.Trace: {
      log.trace('test', context);
      break;
    }
    case LogLevel.Debug: {
      log.debug('test', context);
      break;
    }
    case LogLevel.Info: {
      log.info('test', context);
      break;
    }
    case LogLevel.Warn: {
      log.warn('test', context);
      break;
    }
    case LogLevel.Error: {
      log.error('test', context);
      break;
    }
  }
};
