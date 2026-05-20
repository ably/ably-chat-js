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

  /**
   * When `true`, the SDK generates a unique idempotency identifier for each
   * `send/update/delete` call and sends it with the request. If the request is
   * retried internally across fallback hosts, the same identifier is used,
   * allowing the server to deduplicate the attempt.
   *
   * The identifier is regenerated for each new call.
   * @defaultValue false
   */
  idempotentRestPublishing?: boolean;
}

/**
 * Default configuration options for the chat client.
 */
const defaultClientOptions = {
  logLevel: LogLevel.Error,
  idempotentRestPublishing: false,
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
    idempotentRestPublishing: boolean;
  }
>;

export const normalizeClientOptions = (options?: ChatClientOptions): NormalizedChatClientOptions => {
  options = options ?? {};

  return {
    ...options,
    logLevel: options.logLevel ?? defaultClientOptions.logLevel,
    idempotentRestPublishing: options.idempotentRestPublishing ?? defaultClientOptions.idempotentRestPublishing,
  };
};
