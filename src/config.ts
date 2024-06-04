/**
 * Configuration options for the chat client.
 */
export interface ClientOptions {
  /**
   * The time in milliseconds after which the client will emit a stopped typing event, if the user has not typed anything.
   * @defaultValue 3000
   */
  typingTimeoutMs: number;
}

/**
 * Default configuration options for the chat client.
 */
export const DefaultClientOptions: ClientOptions = {
  typingTimeoutMs: 3000,
};
