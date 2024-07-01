import * as Ably from 'ably';

import { getChannel } from './channel.js';
import { ChatApi } from './ChatApi.js';
import { Logger } from './logger.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * Represents the occupancy (number of connections, publishers, and subscribers) of a chat room.
 */
export interface Occupancy {
  /**
   * Subscribe a given listener to the occupancy of the chat room. This will implicitly attach the underlying channel
   * and enable occupancy events.
   *
   * @param listener A listener to be called when the occupancy of the room changes.
   * @returns A promise resolves to the channel attachment state change event from the implicit channel attach operation.
   */
  subscribe(listener: OccupancyListener): Promise<Ably.ChannelStateChange | null>;

  /**
   * Unsubscribes a given listener from the occupancy of the chat room. If there are no more listeners, this will
   * implicitly detach the underlying channel and disable occupancy events.
   *
   * @param listener The listener to be unsubscribed from the occupancy of the room.
   * @returns A promise that resolves when the implicit channel detach operation completes, or immediately if there
   * are still other listeners.
   */
  unsubscribe(listener: OccupancyListener): Promise<void>;

  /**
   * Get the current occupancy of the chat room.
   *
   * @returns A promise that resolves to the current occupancy of the chat room.
   */
  get(): Promise<OccupancyEvent>;

  /**
   * Get underlying Ably channel for occupancy events.
   *
   * @returns The underlying Ably channel for occupancy events.
   */
  get channel(): Ably.RealtimeChannel;
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
  occupancy = 'occupancy',
}

interface OccupancyEventsMap {
  [OccupancyEvents.occupancy]: OccupancyEvent;
}

export class DefaultOccupancy extends EventEmitter<OccupancyEventsMap> implements Occupancy {
  private readonly roomId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _chatApi: ChatApi;
  private _internalListener: Ably.messageCallback<Ably.InboundMessage> | undefined;
  private _logger: Logger;

  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi, logger: Logger) {
    super();
    this.roomId = roomId;
    this._channel = getChannel(`${roomId}::$chat::$chatMessages`, realtime);
    this._chatApi = chatApi;
    this._logger = logger;
  }

  /**
   * @inheritdoc Occupancy
   */
  async subscribe(listener: OccupancyListener): Promise<Ably.ChannelStateChange | null> {
    this._logger.trace('Occupancy.subscribe();');
    const hasListeners = this.hasListeners();
    this.on(listener);

    if (!hasListeners) {
      this._logger.debug('Occupancy.subscribe(); adding internal listener');
      this._internalListener = this.internalOccupancyListener.bind(this);
      return this._channel
        .subscribe(['[meta]occupancy'], this._internalListener)
        .then(async (stateChange: Ably.ChannelStateChange | null) => {
          await this._channel.setOptions({ params: { occupancy: 'metrics' } });
          return stateChange;
        });
    }

    return this._channel.attach();
  }

  /**
   * @inheritdoc Occupancy
   */
  async unsubscribe(listener: OccupancyListener): Promise<void> {
    this.off(listener);

    if (!this.hasListeners()) {
      this._logger.debug('Occupancy.unsubscribe(); removing internal listener');
      return this._channel.setOptions({}).then(() => {
        this._internalListener ? this._channel.unsubscribe(this._internalListener) : null;
        this._internalListener = undefined;
      });
    }

    return Promise.resolve();
  }

  /**
   * @inheritdoc Occupancy
   */
  async get(): Promise<OccupancyEvent> {
    this._logger.trace('Occupancy.get();');
    return this._chatApi.getOccupancy(this.roomId);
  }

  /**
   * @inheritdoc Occupancy
   */
  get channel(): Ably.RealtimeChannel {
    return this._channel;
  }

  /**
   * An internal listener that listens for occupancy events from the underlying channel and translates them into
   * occupancy events for the public API.
   */
  private internalOccupancyListener(message: Ably.InboundMessage): void {
    const { metrics } = message.data as { metrics?: { connections?: number; presenceMembers?: number } };

    if (metrics === undefined) {
      this._logger.error('invalid occupancy event received; metrics is missing', message);
      return;
    }

    const { connections, presenceMembers } = metrics;

    if (connections === undefined) {
      this._logger.error('invalid occupancy event received; connections is missing', message);
      return;
    }

    if (presenceMembers === undefined) {
      this._logger.error('invalid occupancy event received; presenceMembers is missing', message);
      return;
    }

    this.emit(OccupancyEvents.occupancy, {
      connections: connections,
      presenceMembers: presenceMembers,
    });
  }
}
