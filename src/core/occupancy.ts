import * as Ably from 'ably';

import { ChannelOptionsMerger } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
import { OccupancyEvent, OccupancyEventType, RealtimeMetaEventType } from './events.js';
import { Logger } from './logger.js';
import { InternalRoomOptions } from './room-options.js';
import { Subscription } from './subscription.js';
import EventEmitter, { wrap } from './utils/event-emitter.js';

/**
 * This interface is used to interact with occupancy in a chat room: subscribing to occupancy updates and
 * fetching the current room occupancy metrics.
 *
 * Get an instance via {@link Room.occupancy}.
 */
export interface Occupancy {
  /**
   * Subscribe a given listener to occupancy updates of the chat room.
   *
   * Note: This requires occupancy events to be enabled via the `enableEvents` option in
   * the {@link OccupancyOptions} options provided to the room. If this is not enabled, an error will be thrown.
   *
   * @param listener A listener to be called when the occupancy of the room changes.
   * @returns A subscription object that can be used to unsubscribe the listener.
   * @throws {Ably.ErrorInfo} If occupancy events are not enabled for this room.
   */
  subscribe(listener: OccupancyListener): Subscription;

  /**
   * Get the current occupancy of the chat room.
   *
   * @returns A promise that resolves to the current occupancy of the chat room.
   */
  get(): Promise<OccupancyData>;

  /**
   * Get the latest occupancy data received from realtime events.
   *
   * @returns The latest occupancy data, or undefined if no realtime events have been received yet.
   * @throws {Ably.ErrorInfo} If occupancy events are not enabled for this room.
   */
  current(): OccupancyData | undefined;
}

/**
 * Represents the occupancy data of a chat room.
 */
export interface OccupancyData {
  /**
   * The number of connections to the chat room.
   */
  connections: number;

  /**
   * The number of presence members in the chat room - members who have entered presence.
   */
  presenceMembers: number;
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

    this._applyChannelSubscriptions();
  }

  /**
   * Sets up channel subscriptions for occupancy.
   */
  private _applyChannelSubscriptions(): void {
    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void this._channel.subscribe([RealtimeMetaEventType.Occupancy], this._internalOccupancyListener.bind(this));
  }

  /**
   * @inheritdoc Occupancy
   */
  subscribe(listener: OccupancyListener): Subscription {
    this._logger.trace('Occupancy.subscribe();');

    if (!this._roomOptions.occupancy.enableEvents) {
      throw new Ably.ErrorInfo(
        'cannot subscribe to occupancy; occupancy events are not enabled in room options',
        40000,
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
   * @inheritdoc Occupancy
   */
  async get(): Promise<OccupancyData> {
    this._logger.trace('Occupancy.get();');
    return this._chatApi.getOccupancy(this._roomName);
  }

  /**
   * @inheritdoc Occupancy
   */
  current(): OccupancyData | undefined {
    this._logger.trace('Occupancy.current();');

    // CHA-O7c
    if (!this._roomOptions.occupancy.enableEvents) {
      throw new Ably.ErrorInfo(
        'cannot get current occupancy; occupancy events are not enabled in room options',
        40000,
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
   */
  private _internalOccupancyListener(message: Ably.InboundMessage): void {
    this._logger.trace('Occupancy._internalOccupancyListener();', message);
    if (typeof message.data !== 'object') {
      this._logger.error(
        'Occupancy._internalOccupancyListener(); invalid occupancy event received; data is not an object',
        message,
      );
      return;
    }

    const { metrics } = message.data as { metrics?: { connections?: number; presenceMembers?: number } };

    if (metrics === undefined) {
      this._logger.error(
        'Occupancy._internalOccupancyListener(); invalid occupancy event received; metrics is missing',
        message,
      );
      return;
    }

    const { connections, presenceMembers } = metrics;

    if (connections === undefined) {
      this._logger.error(
        'Occupancy._internalOccupancyListener(); invalid occupancy event received; connections is missing',
        message,
      );
      return;
    }

    if (!Number.isInteger(connections)) {
      this._logger.error(
        'Occupancy._internalOccupancyListener(); invalid occupancy event received; connections is not a number',
        message,
      );
      return;
    }

    if (presenceMembers === undefined) {
      this._logger.error(
        'Occupancy._internalOccupancyListener(); invalid occupancy event received; presenceMembers is missing',
        message,
      );
      return;
    }

    if (!Number.isInteger(presenceMembers)) {
      this._logger.error(
        'Occupancy._internalOccupancyListener(); invalid occupancy event received; presenceMembers is not a number',
        message,
      );
      return;
    }

    this._latestOccupancyData = {
      connections: connections,
      presenceMembers: presenceMembers,
    };

    this._emitter.emit(OccupancyEventType.Updated, {
      type: OccupancyEventType.Updated,
      occupancy: this._latestOccupancyData,
    });
  }

  /**
   * Merges the channel options for the room with the ones required for occupancy.
   *
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
}
