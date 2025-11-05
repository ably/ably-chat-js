import * as Ably from 'ably';

import { ChannelOptionsMerger } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
import { ErrorCode } from './errors.js';
import { OccupancyEvent, OccupancyEventType, RealtimeMetaEventType } from './events.js';
import { Logger } from './logger.js';
import { OccupancyData, parseOccupancyMessage } from './occupancy-parser.js';
import { subscribe } from './realtime-subscriptions.js';
import { InternalRoomOptions } from './room-options.js';
import { Subscription } from './subscription.js';
import EventEmitter, { emitterHasListeners, wrap } from './utils/event-emitter.js';

/**
 * This interface is used to interact with occupancy in a chat room: subscribing to occupancy updates and
 * fetching the current room occupancy metrics.
 *
 * Get an instance via {@link Room.occupancy}.
 */
export interface Occupancy {
  /**
   * Subscribes to occupancy updates for the chat room.
   *
   * Receives updates whenever the number of connections or present members in the room changes.
   * This is useful for displaying active user counts, monitoring room capacity, or tracking
   * engagement metrics.
   *
   * **Note**:
   * - Requires {@link OccupancyOptions.enableEvents} to be true in the room's occupancy options.
   * - The room should be attached to receive occupancy events.
   * @param listener - Callback invoked when room occupancy changes
   * @returns Subscription object with an unsubscribe method
   * @throws An {@link Ably.ErrorInfo} with {@link ErrorCode.FeatureNotEnabledInRoom} if occupancy events are not enabled
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, OccupancyEvent } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Create room with occupancy events enabled
   * const room = await chatClient.rooms.get('conference-room', {
   *   occupancy: { enableEvents: true }
   * });
   *
   *
   * // Subscribe to occupancy updates
   * const subscription = room.occupancy.subscribe((event: OccupancyEvent) => {
   *   const { connections, presenceMembers } = event.occupancy;
   *
   *   console.log(`Room occupancy updated:`);
   *   console.log(`Total connections: ${connections}`);
   *   console.log(`Presence members: ${presenceMembers}`);
   * });
   *
   * // Attach to the room to start receiving events
   * await room.attach();
   *
   * // Later, unsubscribe when done
   * subscription.unsubscribe();
   * ```
   */
  subscribe(listener: OccupancyListener): Subscription;

  /**
   * Fetches the current occupancy of the chat room from the server.
   *
   * Retrieves the latest occupancy metrics, including the number
   * of active connections and presence members. Use this for on-demand occupancy
   * checks or when occupancy events are not enabled.
   *
   * **Note**: This method uses the Ably Chat REST API and so does not require the room
   * to be attached to be called.
   * @returns Promise resolving to current occupancy data
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, OccupancyData } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * const room = await chatClient.rooms.get('webinar-room');
   *
   * // Get current occupancy on demand
   * try {
   *   const occupancy: OccupancyData = await room.occupancy.get();
   *
   *   console.log(`Current room statistics:`);
   *   console.log(`Active connections: ${occupancy.connections}`);
   *   console.log(`Presence members: ${occupancy.presenceMembers}`);
   * } catch (error) {
   *   console.error('Failed to fetch occupancy:', error);
   * }
   * ```
   */
  get(): Promise<OccupancyData>;

  /**
   * Gets the latest occupancy data cached from realtime events.
   *
   * Returns the most recent occupancy metrics received via subscription. Returns undefined
   * if no occupancy events have been received yet since the room was attached.
   *
   * **Note**:
   * - Requires `enableEvents` to be true in the room's occupancy options.
   * - Returns undefined until the first occupancy event is received.
   * @returns Latest cached occupancy data or undefined if no events received
   * @throws An {@link Ably.ErrorInfo} with {@link ErrorCode.FeatureNotEnabledInRoom} if occupancy events are not enabled
   * @example
   * ```typescript
   * import * as Ably from 'ably';
   * import { ChatClient, OccupancyData } from '@ably/chat';
   *
   * const chatClient: ChatClient; // existing ChatClient instance
   *
   * // Room with occupancy events enabled
   * const room = await chatClient.rooms.get('gaming-lobby', {
   *   occupancy: { enableEvents: true }
   * });
   *
   * // Subscribe to occupancy events
   * room.occupancy.subscribe((event) => {
   *   console.log('Occupancy updated:', event.occupancy);
   * });
   *
   * // Get cached occupancy instantly (after first event)
   * function displayCurrentOccupancy() {
   *   const occupancy = room.occupancy.current;
   *
   *   if (occupancy) {
   *     console.log(`Current cached occupancy:`);
   *     console.log(`Connections: ${occupancy.connections}`);
   *     console.log(`Presence: ${occupancy.presenceMembers}`);
   *   } else {
   *     console.log('No occupancy data received yet, try fetching from server');
   *   }
   * }
   *
   * // Attach to the room to start receiving events
   * await room.attach();
   *
   * ```
   */
  get current(): OccupancyData | undefined;
}

/**
 * A listener that is called when the occupancy of a chat room changes.
 * @param event The occupancy event.
 */
export type OccupancyListener = (event: OccupancyEvent) => void;

interface OccupancyEventsMap {
  [OccupancyEventType.Updated]: OccupancyEvent;
}

/**
 * @inheritDoc
 */
export class DefaultOccupancy implements Occupancy {
  private readonly _roomName: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _chatApi: ChatApi;
  private readonly _logger: Logger;
  private readonly _emitter = new EventEmitter<OccupancyEventsMap>();
  private readonly _roomOptions: InternalRoomOptions;
  private _latestOccupancyData?: OccupancyData;
  private readonly _unsubscribeOccupancyEvents: () => void;

  /**
   * Constructs a new `DefaultOccupancy` instance.
   * @param roomName The unique identifier of the room.
   * @param channel An instance of the Realtime channel.
   * @param chatApi An instance of the ChatApi.
   * @param logger An instance of the Logger.
   * @param roomOptions The room options.
   */
  constructor(
    roomName: string,
    channel: Ably.RealtimeChannel,
    chatApi: ChatApi,
    logger: Logger,
    roomOptions: InternalRoomOptions,
  ) {
    this._roomName = roomName;
    this._channel = channel;
    this._chatApi = chatApi;
    this._logger = logger;
    this._roomOptions = roomOptions;

    // Create bound listener
    const occupancyEventsListener = this._internalOccupancyListener.bind(this);

    // Use subscription helper to create cleanup function
    if (this._roomOptions.occupancy.enableEvents) {
      this._logger.debug('DefaultOccupancy(); subscribing to occupancy events');
      this._unsubscribeOccupancyEvents = subscribe(
        this._channel,
        [RealtimeMetaEventType.Occupancy],
        occupancyEventsListener,
      );
    } else {
      this._unsubscribeOccupancyEvents = () => {
        // No-op function when events are not enabled
      };
    }
  }

  /**
   * @inheritdoc
   */
  subscribe(listener: OccupancyListener): Subscription {
    this._logger.trace('Occupancy.subscribe();');

    if (!this._roomOptions.occupancy.enableEvents) {
      throw new Ably.ErrorInfo(
        'unable to subscribe to occupancy; occupancy events are not enabled in room options',
        ErrorCode.FeatureNotEnabledInRoom,
        400,
      ) as unknown as Error;
    }

    const wrapped = wrap(listener);
    this._emitter.on(wrapped);

    return {
      unsubscribe: () => {
        this._logger.trace('Occupancy.unsubscribe();');
        this._emitter.off(wrapped);
      },
    };
  }

  /**
   * @inheritdoc
   */
  async get(): Promise<OccupancyData> {
    this._logger.trace('Occupancy.get();');
    return this._chatApi.getOccupancy(this._roomName);
  }

  /**
   * @inheritdoc
   */
  get current(): OccupancyData | undefined {
    this._logger.trace('Occupancy.current();');

    // CHA-O7c
    if (!this._roomOptions.occupancy.enableEvents) {
      throw new Ably.ErrorInfo(
        'unable to get current occupancy; occupancy events are not enabled in room options',
        ErrorCode.FeatureNotEnabledInRoom,
        400,
      ) as unknown as Error;
    }

    // CHA-07a
    // CHA-07b
    return this._latestOccupancyData;
  }

  /**
   * An internal listener that listens for occupancy events from the underlying channel and translates them into
   * occupancy events for the public API.
   * @param message The inbound message containing occupancy data.
   */
  private _internalOccupancyListener(message: Ably.InboundMessage): void {
    this._logger.trace('Occupancy._internalOccupancyListener();', message);

    this._latestOccupancyData = parseOccupancyMessage(message);

    this._emitter.emit(OccupancyEventType.Updated, {
      type: OccupancyEventType.Updated,
      occupancy: this._latestOccupancyData,
    });
  }

  /**
   * Merges the channel options for the room with the ones required for occupancy.
   * @param roomOptions The internal room options.
   * @returns A function that merges the channel options for the room with the ones required for occupancy.
   */
  static channelOptionMerger(roomOptions: InternalRoomOptions): ChannelOptionsMerger {
    return (options) => {
      // Occupancy not required, so we can skip this.
      if (!roomOptions.occupancy.enableEvents) {
        return options;
      }

      return { ...options, params: { ...options.params, occupancy: 'metrics' } };
    };
  }

  /**
   * Disposes of the occupancy instance, removing all listeners and subscriptions.
   * This method should be called when the room is being released to ensure proper cleanup.
   * @internal
   */
  dispose(): void {
    this._logger.trace('DefaultOccupancy.dispose();');

    // Remove occupancy event subscriptions using stored unsubscribe function
    this._unsubscribeOccupancyEvents();

    // Remove user-level listeners
    this._emitter.off();

    this._logger.debug('DefaultOccupancy.dispose(); disposed successfully');
  }

  /**
   * Checks if there are any listeners registered by users.
   * @internal
   * @returns true if there are listeners, false otherwise.
   */
  hasListeners(): boolean {
    return emitterHasListeners(this._emitter);
  }
}
