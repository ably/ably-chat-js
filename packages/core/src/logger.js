import * as Ably from 'ably';
/**
 * Represents the different levels of logging that can be used.
 */
export var LogLevel;
(function (LogLevel) {
    /**
     * Something routine and expected has occurred. This level will provide logs for the vast majority of operations
     * and function calls.
     */
    LogLevel["Trace"] = "trace";
    /**
     * Development information, messages that are useful when trying to debug library behavior,
     * but superfluous to normal operation.
     */
    LogLevel["Debug"] = "debug";
    /**
     * Informational messages. Operationally significant to the library but not out of the ordinary.
     */
    LogLevel["Info"] = "info";
    /**
     * Anything that is not immediately an error, but could cause unexpected behavior in the future. For example,
     * passing an invalid value to an option. Indicates that some action should be taken to prevent future errors.
     */
    LogLevel["Warn"] = "warn";
    /**
     * A given operation has failed and cannot be automatically recovered. The error may threaten the continuity
     * of operation.
     */
    LogLevel["Error"] = "error";
    /**
     * No logging will be performed.
     */
    LogLevel["Silent"] = "silent";
})(LogLevel || (LogLevel = {}));
/**
 * A simple console logger that logs messages to the console.
 *
 * @param message The message to log.
 * @param level The log level of the message.
 * @param context - The context of the log message as key-value pairs.
 */
const consoleLogger = (message, level, context) => {
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
export const makeLogger = (options) => {
    var _a;
    const logHandler = (_a = options.logHandler) !== null && _a !== void 0 ? _a : consoleLogger;
    return new DefaultLogger(logHandler, options.logLevel);
};
/**
 * A convenient list of log levels as numbers that can be used for easier comparison.
 */
var LogLevelNumbers;
(function (LogLevelNumbers) {
    LogLevelNumbers[LogLevelNumbers["Trace"] = 0] = "Trace";
    LogLevelNumbers[LogLevelNumbers["Debug"] = 1] = "Debug";
    LogLevelNumbers[LogLevelNumbers["Info"] = 2] = "Info";
    LogLevelNumbers[LogLevelNumbers["Warn"] = 3] = "Warn";
    LogLevelNumbers[LogLevelNumbers["Error"] = 4] = "Error";
    LogLevelNumbers[LogLevelNumbers["Silent"] = 5] = "Silent";
})(LogLevelNumbers || (LogLevelNumbers = {}));
/**
 * A mapping of log levels to their numeric equivalents.
 */
const logLevelNumberMap = new Map([
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
class DefaultLogger {
    constructor(handler, level) {
        this._handler = handler;
        const levelNumber = logLevelNumberMap.get(level);
        if (levelNumber === undefined) {
            throw new Ably.ErrorInfo(`Invalid log level: ${level}`, 50000, 500);
        }
        this._levelNumber = levelNumber;
    }
    trace(message, context) {
        this._write(message, LogLevel.Trace, LogLevelNumbers.Trace, context);
    }
    debug(message, context) {
        this._write(message, LogLevel.Debug, LogLevelNumbers.Debug, context);
    }
    info(message, context) {
        this._write(message, LogLevel.Info, LogLevelNumbers.Info, context);
    }
    warn(message, context) {
        this._write(message, LogLevel.Warn, LogLevelNumbers.Warn, context);
    }
    error(message, context) {
        this._write(message, LogLevel.Error, LogLevelNumbers.Error, context);
    }
    _write(message, level, levelNumber, context) {
        if (levelNumber >= this._levelNumber) {
            this._handler(message, level, context);
        }
    }
}
//# sourceMappingURL=logger.js.map