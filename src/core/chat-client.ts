import * as Ably from 'ably';

import { DefaultClientIdResolver } from './client-id.js';
import { ChatClientOptions, normalizeClientOptions, NormalizedChatClientOptions } from './config.js';
import { Connection, DefaultConnection, InternalConnection } from './connection.js';
import { randomId } from './id.js';
import { Logger, makeLogger } from './logger.js';
import { RealtimeWithOptions } from './realtime-extensions.js';
import { DefaultRooms, Rooms } from './rooms.js';
import { VERSION } from './version.js';

/**
 * This is the core client for Ably chat. It provides access to chat rooms.
 */
export class ChatClient {
  /**
   * @internal
   */
  private readonly _realtime: Ably.Realtime;

  /**
   * @internal
   */
  private readonly _rooms: DefaultRooms;

  /**
   * @internal
   */
  private readonly _clientOptions: NormalizedChatClientOptions;

  /**
   * @internal
   */
  private readonly _connection: InternalConnection;

  /**
   * @internal
   */
  private readonly _logger: Logger;

  /**
   * @internal
   */
  private readonly _nonce: string;

  /**
   * @internal
   */
  private readonly _clientIdResolver: DefaultClientIdResolver;

  /**
   * Creates a new ChatClient instance for interacting with Ably Chat.
   *
   * The ChatClient is the main entry point for the Ably Chat SDK. It requires a Realtime client
   * and provides access to chat rooms through the rooms property.
   *
   * **Important**: The Ably Realtime client must have a clientId set. This identifies
   * the user in chat rooms and is required for all chat operations.
   *
   * **NOTE**: You can provide optional overrides to the {@link ChatClient}, these will be merged
   * with the default options. See {@link ChatClientOptions} for the available options.
   * @param realtime - An initialized Ably Realtime client with a configured clientId
   * @param clientOptions - Optional configuration for the chat client
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, LogLevel } from '@ably/chat';
   *
   * // Preferred in production: Use auth URL that returns a JWT
   * const realtimeClientWithJWT = new Ably.Realtime({
   *   authUrl: '/api/ably-auth', // Your server endpoint that returns a JWT with clientId
   *   authMethod: 'POST'
   * });
   *
   * const chatClient = new ChatClient(realtimeClientWithJWT)
   *```
   * @example
   *```typescript
   * // Alternative for development and server-side operations: Set clientId directly (requires API key)
   * const realtimeClientWithKey = new Ably.Realtime({
   *   key: 'your-ably-api-key',
   *   clientId: 'user-123'
   * });
   *
   * const chatClient = new ChatClient(realtimeClientWithKey)
   * ```
   * @example
   * ```typescript
   * const realtimeClient = new Ably.Realtime({
   *   authUrl: '/api/ably-auth',
   *   authMethod: 'POST'
   * });
   *
   * // With custom logging configuration: Defaults to LogLevel.Info and console logging
   * const chatClientWithLogging = new ChatClient(realtimeClient, {
   *   logLevel: LogLevel.Debug,
   *   logHandler: (message, level, context) => {
   *     // Send to your logging service
   *     yourLoggerInstance.log({
   *       level,
   *       message,
   *       context,
   *       timestamp: new Date()
   *     });
   *   }
   * });
   * ```
   */
  constructor(realtime: Ably.Realtime, clientOptions?: ChatClientOptions) {
    this._realtime = realtime;
    this._clientOptions = normalizeClientOptions(clientOptions);
    this._nonce = randomId();
    this._logger = makeLogger(this._clientOptions).withContext({
      chatClientNonce: this._nonce,
    });

    this._connection = new DefaultConnection(realtime, this._logger);
    this._clientIdResolver = new DefaultClientIdResolver(realtime, this._logger);
    this._rooms = new DefaultRooms(realtime, this._clientIdResolver, this._logger);
    this._addAgent('chat-js');
    this._logger.trace(`ably chat client version ${VERSION}; initialized`);
  }

  /**
   * Provides access to the rooms instance for creating and managing chat rooms.
   * @returns The Rooms instance for managing chat rooms
   * @example
   * ```typescript
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Get a room with default options
   * const room = await chatClient.rooms.get('general-chat');
   *
   * // Get a room with custom options (merges with defaults)
   * const configuredRoom = await chatClient.rooms.get('team-chat', {
   *   typing: { heartbeatThrottleMs: 1000 }
   * });
   *
   * // Release a room when done
   * await chatClient.rooms.release('general-chat');
   * ```
   */
  get rooms(): Rooms {
    return this._rooms;
  }

  /**
   * Provides access to the underlying connection to Ably for monitoring connectivity.
   * @returns The Connection instance
   * @example
   * ```typescript
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Check current connection status
   * console.log('Status:', chatClient.connection.status);
   * console.log('Error:', chatClient.connection.error);
   *
   * // Monitor connection changes
   * const { off } = chatClient.connection.onStatusChange((change) => {
   *   console.log(`Connection: ${change.previous} -> ${change.current}`);
   * });
   * ```
   */
  get connection(): Connection {
    return this._connection;
  }

  /**
   * Returns the clientId of the current client, if known.
   *
   * **Important** When using an Ably key for authentication, this value is determined immediately. If using a token,
   * the clientId is not known until the client has successfully connected to and authenticated with
   * the server. Use the `chatClient.connection.status` to check the connection status.
   * @returns The clientId, or undefined if unknown.
   */
  get clientId(): string | undefined {
    return this._realtime.auth.clientId;
  }

  /**
   * Provides direct access to the underlying Ably Realtime client.
   *
   * Use this for advanced scenarios requiring direct Ably access. Most chat
   * operations should use the high-level chat SDK methods instead.
   *
   * **Note**: Directly interacting with the Ably Realtime client can lead to
   * unexpected behavior.
   * @returns The underlying Ably Realtime client instance
   */
  get realtime(): Ably.Realtime {
    return this._realtime;
  }

  /**
   * The configuration options used to initialize the chat client.
   * @returns The resolved client options including defaults
   */
  get clientOptions(): ChatClientOptions {
    return this._clientOptions;
  }

  /**
   * Returns the logger instance for the client.
   * @internal
   * @returns The logger instance.
   */
  get logger(): Logger {
    return this._logger;
  }

  /**
   * Adds additional agent information to the client.
   * Used internally to add React-specific agent information.
   * @internal
   */
  public addReactAgent(): void {
    this._addAgent('chat-react');
    this._rooms.useReact();
  }

  /**
   * Adds additional agent information to the client.
   * This is used internally to add a specific agent with a version.
   * @param agent - The agent to add.
   * @param version - The version of the agent, defaults to the current client version.
   * @internal
   */
  public addAgentWithVersion(agent: string, version: string): void {
    this._addAgent(agent, version);
    this._logger.trace(`Added agent ${agent} with version ${version}`);
  }

  /**
   * Disposes of the ChatClient instance and releases all resources.
   *
   * Releases all chat rooms, removes event listeners, and cleans up connections.
   * After calling dispose, the ChatClient instance is no longer usable. This should
   * be called when you're completely done with the chat functionality.
   *
   * **Note**: This will release ALL rooms managed by this ChatClient and the ChatClient cannot be reused after disposal.
   * @returns Promise that resolves when all resources are released
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Use the chat client
   * const roomOne = await chatClient.rooms.get('general-chat');
   * const roomTwo = await chatClient.rooms.get('random-chat');
   *
   * // ... chat operations ...
   *
   * // Clean up when completely done
   * try {
   *   await chatClient.dispose();
   *   console.log('Chat client disposed successfully');
   * } catch (error) {
   *   console.error('Failed to dispose chat client:', error);
   * }
   *
   * ```
   */
  async dispose(): Promise<void> {
    this._logger.trace('ChatClient.dispose();');

    // Release all rooms before disposing
    await this._rooms.dispose();

    // Dispose of the connection instance
    this._connection.dispose();

    this._logger.debug('ChatClient.dispose(); client disposed successfully');
  }

  /**
   * Sets the agent string for the client.
   * @param agent - The agent to add.
   * @param version - The version of the agent, defaults to the current client version.
   * @internal
   */
  private _addAgent(agent: string, version?: string): void {
    const realtime = this._realtime as RealtimeWithOptions;
    realtime.options.agents = { ...(realtime.options.agents ?? realtime.options.agents), [agent]: version ?? VERSION };
  }
}
