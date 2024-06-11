import { describe, expect, it } from 'vitest';

import { DefaultClientOptions } from '../src/config.js';
import { LogLevel, makeLogger } from '../src/logger.js';

describe('logger', () => {
  it.each([
    [LogLevel.trace, LogLevel.trace],
    [LogLevel.debug, LogLevel.trace],
    [LogLevel.info, LogLevel.trace],
    [LogLevel.warn, LogLevel.trace],
    [LogLevel.error, LogLevel.trace],
    [LogLevel.debug, LogLevel.debug],
    [LogLevel.info, LogLevel.debug],
    [LogLevel.warn, LogLevel.debug],
    [LogLevel.error, LogLevel.debug],
    [LogLevel.info, LogLevel.info],
    [LogLevel.warn, LogLevel.info],
    [LogLevel.error, LogLevel.info],
    [LogLevel.warn, LogLevel.warn],
    [LogLevel.error, LogLevel.warn],
    [LogLevel.error, LogLevel.error],
  ])(
    `logs %s when configured level %s`,
    (logLevel: LogLevel, configuredLevel: LogLevel) =>
      new Promise((done, reject) => {
        const options = DefaultClientOptions;
        options.logLevel = configuredLevel;
        options.logHandler = (message: string) => {
          expect(message).toBe('test');
          done();
        };

        const logger = makeLogger(options);
        logger[logLevel]('test');
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
        const options = DefaultClientOptions;
        options.logLevel = configuredLevel;
        options.logHandler = () => {
          reject('Expected logHandler to not be called');
        };

        const logger = makeLogger(options);
        logger[logLevel]('test');
        done();
      }),
  );
});
