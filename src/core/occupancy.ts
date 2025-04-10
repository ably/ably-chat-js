import * as Ably from 'ably';

import { roomChannelName } from './channel.js';
import { ChannelOptionsMerger } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
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
   * @param listener A listener to be called when the occupancy of the room changes.
   * @returns A promise resolves to the channel attachment state change event from the implicit channel attach operation.
   */
  subscribe(listener: OccupancyListener): Subscription;

  /**
   * Unsubscribe all listeners from the occupancy updates of the chat room.
   */
  unsubscribeAll(): void;

  /**
   * Get the current occupancy of the chat room.
   *
   * @returns A promise that resolves to the current occupancy of the chat room.
   */
  get(): Promise<OccupancyEvent>;
}

/**
 * Represents the occupancy of a chat room.
 */
export interface OccupancyEvent {
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

enum OccupancyEvents {
  Occupancy = 'occupancy',
}

interface OccupancyEventsMap {
  [OccupancyEvents.Occupancy]: OccupancyEvent;
}

/**
 * @inheritDoc
 */
export class DefaultOccupancy implements Occupancy {
  private readonly _roomId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _chatApi: ChatApi;
  private readonly _logger: Logger;
  private readonly _emitter = new EventEmitter<OccupancyEventsMap>();

  /**
   * Constructs a new `DefaultOccupancy` instance.
   * @param roomId The unique identifier of the room.
   * @param channel An instance of the Realtime channel.
   * @param chatApi An instance of the ChatApi.
   * @param logger An instance of the Logger.
   */
  constructor(roomId: string, channel: Ably.RealtimeChannel, chatApi: ChatApi, logger: Logger) {
    this._roomId = roomId;
    this._channel = channel;
    this._chatApi = chatApi;
    this._logger = logger;

    this._applyChannelSubscriptions();
  }

  /**
   * Sets up channel subscriptions for occupancy.
   */
  private _applyChannelSubscriptions(): void {
    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void this._channel.subscribe(['[meta]occupancy'], this._internalOccupancyListener.bind(this));
  }

  /**
   * @inheritdoc Occupancy
   */
  subscribe(listener: OccupancyListener): Subscription {
    this._logger.trace('Occupancy.subscribe();');
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
  unsubscribeAll(): void {
    this._logger.trace('Occupancy.unsubscribeAll();');
    this._emitter.off();
  }

  /**
   * @inheritdoc Occupancy
   */
  async get(): Promise<OccupancyEvent> {
    this._logger.trace('Occupancy.get();');
    return this._chatApi.getOccupancy(this._roomId);
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

    this._emitter.emit(OccupancyEvents.Occupancy, {
      connections: connections,
      presenceMembers: presenceMembers,
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
      if (!roomOptions.occupancy.enableInboundOccupancy) {
        return options;
      }

      return { ...options, params: { ...options.params, occupancy: 'metrics' } };
    };
  }

  /**
   * Returns the channel name for the occupancy channel.
   *
   * @param roomId The unique identifier of the room.
   * @returns The channel name for the occupancy channel.
   */
  static channelName(roomId: string): string {
    return roomChannelName(roomId);
  }
}
