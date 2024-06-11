import 'console-polyfill';

import { ClientOptions } from './config.js';

/**
 * Interface for loggers.
 */
export interface Logger {
  /**
   * Log a message at the trace level.
   * @param message The message to log.
   */
  trace(message: string): void;

  /**
   * Log a message at the debug level.
   * @param message The message to log.
   */
  debug(message: string): void;

  /**
   * Log a message at the info level.
   * @param message The message to log.
   */
  info(message: string): void;

  /**
   * Log a message at the warn level.
   * @param message The message to log.
   */
  warn(message: string): void;

  /**
   * Log a message at the error level.
   * @param message The message to log.
   */
  error(message: string): void;
}

/**
 * Represents the different levels of logging that can be used.
 */
export enum LogLevel {
  /**
   * Something routine and expected has occurred. This level will provide logs for the vast majority of operations
   * and function calls.
   */
  trace = 'trace',

  /**
   * Development information, messages that are useful when trying to debug library behaviour,
   * but superfluous to normal operation.
   */
  debug = 'debug',

  /**
   * Informational messages. Operationally significant to the library but not out of the ordinary.
   */
  info = 'info',

  /**
   * Anything that is not immediately an error, but could cause unexpected behaviour in the future. For example,
   * passing an invalid value to an option. Indicates that some action should be taken to prevent future errors.
   */
  warn = 'warn',

  /**
   * A given operation has failed and cannot be automatically recovered. The error may threaten the continuity
   * of operation.
   */
  error = 'error',

  /**
   * No logging will be performed.
   */
  silent = 'silent',
}

/**
 * A function that can be used to handle log messages.
 * @param message The message to log.
 * @param level The log level of the message.
 */
export type LogHandler = (message: string, level: LogLevel) => void;

/**
 * A simple console logger that logs messages to the console.
 *
 * @param message The message to log.
 * @param level The log level of the message.
 */
const consoleLogger = (message: string, level: LogLevel) => {
  const formattedMessage = `[${new Date().toISOString()}] ${LogLevel[level].toUpperCase()} ${message}`;

  switch (level) {
    case LogLevel.trace:
    case LogLevel.debug:
      console.log(formattedMessage);
      break;
    case LogLevel.info:
      console.info(formattedMessage);
      break;
    case LogLevel.warn:
      console.warn(formattedMessage);
      break;
    case LogLevel.error:
      console.error(formattedMessage);
      break;
    case LogLevel.silent:
      break;
  }
};

export const makeLogger = (options: ClientOptions): Logger => {
  const logLevel = options.logLevel || LogLevel.error;
  const logHandler = options.logHandler || consoleLogger;

  return new DefaultLogger(logHandler, logLevel);
};

/**
 * A convenient list of log levels as numbers that can be used for easier comparison.
 */
enum LogLevelNumbers {
  trace = 0,
  debug = 1,
  info = 2,
  warn = 3,
  error = 4,
  silent = 5,
}

/**
 * A mapping of log levels to their numeric equivalents.
 */
const logLevelNumberMap = new Map<LogLevel, LogLevelNumbers>([
  [LogLevel.trace, LogLevelNumbers.trace],
  [LogLevel.debug, LogLevelNumbers.debug],
  [LogLevel.info, LogLevelNumbers.info],
  [LogLevel.warn, LogLevelNumbers.warn],
  [LogLevel.error, LogLevelNumbers.error],
  [LogLevel.silent, LogLevelNumbers.silent],
]);

/**
 * A default logger implementation.
 */
class DefaultLogger implements Logger {
  private readonly _handler: LogHandler;
  private readonly _levelNumber: LogLevelNumbers;

  constructor(handler: LogHandler, level: LogLevel) {
    this._handler = handler;
    if (!logLevelNumberMap.has(level)) {
      throw new Error(`Invalid log level: ${level}`);
    }

    this._levelNumber = logLevelNumberMap.get(level) as LogLevelNumbers;
  }

  trace(message: string): void {
    this.write(message, LogLevel.trace, LogLevelNumbers.trace);
  }

  debug(message: string): void {
    this.write(message, LogLevel.debug, LogLevelNumbers.debug);
  }

  info(message: string): void {
    this.write(message, LogLevel.info, LogLevelNumbers.info);
  }

  warn(message: string): void {
    this.write(message, LogLevel.warn, LogLevelNumbers.warn);
  }

  error(message: string): void {
    this.write(message, LogLevel.error, LogLevelNumbers.error);
  }

  private write(message: string, level: LogLevel, levelNumber: LogLevelNumbers): void {
    if (levelNumber >= this._levelNumber) {
      this._handler(message, level);
    }
  }
}
