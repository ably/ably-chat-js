import { NormalizedClientOptions } from './config.js';

/**
 * Interface for loggers.
 */
export interface Logger {
  /**
   * Log a message at the trace level.
   * @param message The message to log.
   * @param context The context of the log message as key-value pairs.
   */
  trace(message: string, context?: LogContext): void;

  /**
   * Log a message at the debug level.
   * @param message The message to log.
   * @param context The context of the log message as key-value pairs.
   */
  debug(message: string, context?: LogContext): void;

  /**
   * Log a message at the info level.
   * @param message The message to log.
   * @param context The context of the log message as key-value pairs.
   */
  info(message: string, context?: LogContext): void;

  /**
   * Log a message at the warn level.
   * @param message The message to log.
   * @param context The context of the log message as key-value pairs.
   */
  warn(message: string, context?: LogContext): void;

  /**
   * Log a message at the error level.
   * @param message The message to log.
   * @param context The context of the log message as key-value pairs.
   */
  error(message: string, context?: LogContext): void;
}

/**
 * Represents the different levels of logging that can be used.
 */
export enum LogLevel {
  /**
   * Something routine and expected has occurred. This level will provide logs for the vast majority of operations
   * and function calls.
   */
  Trace = 'trace',

  /**
   * Development information, messages that are useful when trying to debug library behavior,
   * but superfluous to normal operation.
   */
  Debug = 'debug',

  /**
   * Informational messages. Operationally significant to the library but not out of the ordinary.
   */
  Info = 'info',

  /**
   * Anything that is not immediately an error, but could cause unexpected behavior in the future. For example,
   * passing an invalid value to an option. Indicates that some action should be taken to prevent future errors.
   */
  Warn = 'warn',

  /**
   * A given operation has failed and cannot be automatically recovered. The error may threaten the continuity
   * of operation.
   */
  Error = 'error',

  /**
   * No logging will be performed.
   */
  Silent = 'silent',
}

/**
 * Represents the context of a log message.
 * It is an object of key-value pairs that can be used to provide additional context to a log message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LogContext = Record<string, any>;

/**
 * A function that can be used to handle log messages.
 * @param message The message to log.
 * @param level The log level of the message.
 * @param context The context of the log message as key-value pairs.
 */
export type LogHandler = (message: string, level: LogLevel, context?: LogContext) => void;

/**
 * A simple console logger that logs messages to the console.
 *
 * @param message The message to log.
 * @param level The log level of the message.
 * @param context - The context of the log message as key-value pairs.
 */
const consoleLogger = (message: string, level: LogLevel, context?: LogContext) => {
  const contextString = context ? `, context: ${JSON.stringify(context)}` : '';
  const formattedMessage = `[${new Date().toISOString()}] ${level.valueOf().toUpperCase()} ably-chat: ${message}${contextString}`;

  switch (level) {
    case LogLevel.Trace:
    case LogLevel.Debug: {
      console.log(formattedMessage);
      break;
    }
    case LogLevel.Info: {
      console.info(formattedMessage);
      break;
    }
    case LogLevel.Warn: {
      console.warn(formattedMessage);
      break;
    }
    case LogLevel.Error: {
      console.error(formattedMessage);
      break;
    }
    case LogLevel.Silent: {
      break;
    }
  }
};

export const makeLogger = (options: NormalizedClientOptions): Logger => {
  const logHandler = options.logHandler ?? consoleLogger;

  return new DefaultLogger(logHandler, options.logLevel);
};

/**
 * A convenient list of log levels as numbers that can be used for easier comparison.
 */
enum LogLevelNumbers {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
  Silent = 5,
}

/**
 * A mapping of log levels to their numeric equivalents.
 */
const logLevelNumberMap = new Map<LogLevel, LogLevelNumbers>([
  [LogLevel.Trace, LogLevelNumbers.Trace],
  [LogLevel.Debug, LogLevelNumbers.Debug],
  [LogLevel.Info, LogLevelNumbers.Info],
  [LogLevel.Warn, LogLevelNumbers.Warn],
  [LogLevel.Error, LogLevelNumbers.Error],
  [LogLevel.Silent, LogLevelNumbers.Silent],
]);

/**
 * A default logger implementation.
 */
class DefaultLogger implements Logger {
  private readonly _handler: LogHandler;
  private readonly _levelNumber: LogLevelNumbers;

  constructor(handler: LogHandler, level: LogLevel) {
    this._handler = handler;

    const levelNumber = logLevelNumberMap.get(level);
    if (levelNumber === undefined) {
      throw new Error(`Invalid log level: ${level}`);
    }

    this._levelNumber = levelNumber;
  }

  trace(message: string, context?: LogContext): void {
    this._write(message, LogLevel.Trace, LogLevelNumbers.Trace, context);
  }

  debug(message: string, context?: LogContext): void {
    this._write(message, LogLevel.Debug, LogLevelNumbers.Debug, context);
  }

  info(message: string, context?: LogContext): void {
    this._write(message, LogLevel.Info, LogLevelNumbers.Info, context);
  }

  warn(message: string, context?: LogContext): void {
    this._write(message, LogLevel.Warn, LogLevelNumbers.Warn, context);
  }

  error(message: string, context?: LogContext): void {
    this._write(message, LogLevel.Error, LogLevelNumbers.Error, context);
  }

  private _write(message: string, level: LogLevel, levelNumber: LogLevelNumbers, context?: LogContext): void {
    if (levelNumber >= this._levelNumber) {
      this._handler(message, level, context);
    }
  }
}
