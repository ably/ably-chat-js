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
export declare enum LogLevel {
    /**
     * Something routine and expected has occurred. This level will provide logs for the vast majority of operations
     * and function calls.
     */
    Trace = "trace",
    /**
     * Development information, messages that are useful when trying to debug library behavior,
     * but superfluous to normal operation.
     */
    Debug = "debug",
    /**
     * Informational messages. Operationally significant to the library but not out of the ordinary.
     */
    Info = "info",
    /**
     * Anything that is not immediately an error, but could cause unexpected behavior in the future. For example,
     * passing an invalid value to an option. Indicates that some action should be taken to prevent future errors.
     */
    Warn = "warn",
    /**
     * A given operation has failed and cannot be automatically recovered. The error may threaten the continuity
     * of operation.
     */
    Error = "error",
    /**
     * No logging will be performed.
     */
    Silent = "silent"
}
/**
 * Represents the context of a log message.
 * It is an object of key-value pairs that can be used to provide additional context to a log message.
 */
export type LogContext = Record<string, any>;
/**
 * A function that can be used to handle log messages.
 * @param message The message to log.
 * @param level The log level of the message.
 * @param context The context of the log message as key-value pairs.
 */
export type LogHandler = (message: string, level: LogLevel, context?: LogContext) => void;
export declare const makeLogger: (options: NormalizedClientOptions) => Logger;
