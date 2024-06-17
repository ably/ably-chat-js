import { LogHandler, LogLevel } from './logger.js';

/**
 * Configuration options for the chat client.
 */
export interface ClientOptions {
  /**
   * The time in milliseconds after which the client will emit a stopped typing event, if the user has not typed anything.
   * @defaultValue 3000
   */
  typingTimeoutMs?: number;

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
const defaultClientOptions = {
  typingTimeoutMs: 3000,
  logLevel: LogLevel.error,
};

/**
 * This type is used to modify the properties of one type with the properties of another type and thus
 * can be used to turn clientoptions into normalised client options.
 */
type Modify<T, R> = Omit<T, keyof R> & R;

/**
 * These are the normalised client options, with default values filled in for any missing properties.
 */
export type NormalisedClientOptions = Modify<
  ClientOptions,
  {
    typingTimeoutMs: number;
    logLevel: LogLevel;
  }
>;

export const normaliseClientOptions = (options?: ClientOptions): NormalisedClientOptions => {
  options = options ?? {};

  return {
    ...options,
    typingTimeoutMs: options.typingTimeoutMs ?? defaultClientOptions.typingTimeoutMs,
    logLevel: options.logLevel ?? defaultClientOptions.logLevel,
  };
};
