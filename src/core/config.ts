import { LogHandler, LogLevel } from './logger.js';

/**
 * Configuration options for the chat client.
 */
export interface ChatClientOptions {
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
  logLevel: LogLevel.Error,
};

/**
 * This type is used to modify the properties of one type with the properties of another type and thus
 * can be used to turn client options into normalized client options.
 */
type Modify<T, R> = Omit<T, keyof R> & R;

/**
 * These are the normalized client options, with default values filled in for any missing properties.
 */
export type NormalizedChatClientOptions = Modify<
  ChatClientOptions,
  {
    logLevel: LogLevel;
  }
>;

export const normalizeClientOptions = (options?: ChatClientOptions): NormalizedChatClientOptions => {
  options = options ?? {};

  return {
    ...options,
    logLevel: options.logLevel ?? defaultClientOptions.logLevel,
  };
};
