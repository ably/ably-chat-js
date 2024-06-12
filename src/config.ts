import { LogHandler, LogLevel } from './logger.js';

/**
 * Configuration options for the chat client.
 */
export interface ClientOptions {
  /**
   * The time in milliseconds after which the client will emit a stopped typing event, if the user has not typed anything.
   * @defaultValue 3000
   */
  typingTimeoutMs: number;

  /**
   * A custom log handler that will be used to log messages from the client.
   * @defaultValue The client will log messages to the console.
   */
  logHandler?: LogHandler;

  /**
   * The minimum log level at which messages will be logged.
   * @defaultValue LogLevel.error
   */
  logLevel?: LogLevel;
}

/**
 * Default configuration options for the chat client.
 */
export const DefaultClientOptions: ClientOptions = {
  typingTimeoutMs: 3000,
  logLevel: LogLevel.error,
};
