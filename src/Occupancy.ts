import * as Ably from 'ably';

import { ChatApi } from './ChatApi.js';
import { SubscriptionManager } from './SubscriptionManager.js';
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
export type OccupancyEvent = {
  /**
   * The number of connections to the chat room.
   */
  connections: number;

  /**
   * The number of presence members in the chat room - members who have entered presence.
   */
  presenceMembers: number;
};

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
  private readonly _managedChannel: SubscriptionManager;
  private readonly _chatApi: ChatApi;
  private _internalListener: any;

  constructor(roomId: string, managedChannel: SubscriptionManager, chatApi: ChatApi) {
    super();
    this.roomId = roomId;
    this._managedChannel = managedChannel;
    this._chatApi = chatApi;
  }

  /**
   * @inheritdoc Occupancy
   */
  async subscribe(listener: OccupancyListener): Promise<Ably.ChannelStateChange | null> {
    const hasListeners = this.hasListeners();
    this.on(listener);

    if (!hasListeners) {
      this._internalListener = this.internalOccupancyListener.bind(this);
      return this._managedChannel
        .subscribe(['[meta]occupancy'], this._internalListener)
        .then(async (stateChange: Ably.ChannelStateChange | null) => {
          await this._managedChannel.channel.setOptions({ params: { occupancy: 'metrics' } });
          return stateChange;
        });
    }

    return this._managedChannel.channel.attach();
  }

  /**
   * @inheritdoc Occupancy
   */
  async unsubscribe(listener: OccupancyListener): Promise<void> {
    this.off(listener);

    if (!this.hasListeners()) {
      return this._managedChannel.channel
        .setOptions({})
        .then(() => this._managedChannel.unsubscribe(this._internalListener))
        .then(() => {
          this._internalListener = undefined;
        });
    }

    return Promise.resolve();
  }

  /**
   * @inheritdoc Occupancy
   */
  async get(): Promise<OccupancyEvent> {
    return this._chatApi.getOccupancy(this.roomId);
  }

  /**
   * @inheritdoc Occupancy
   */
  get channel(): Ably.RealtimeChannel {
    return this._managedChannel.channel;
  }

  /**
   * An internal listener that listens for occupancy events from the underlying channel and translates them into
   * occupancy events for the public API.
   */
  private internalOccupancyListener(message: Ably.InboundMessage): void {
    const {
      data: { metrics },
    } = message;

    if (metrics === undefined) {
      throw new Ably.ErrorInfo('invalid occupancy event received; metrics is missing', 50000, 500);
    }

    const { connections, presenceMembers } = metrics;

    if (connections === undefined) {
      throw new Ably.ErrorInfo('invalid occupancy event received; connections is missing', 50000, 500);
    }

    if (presenceMembers === undefined) {
      throw new Ably.ErrorInfo('invalid occupancy event received; presenceMembers is missing', 50000, 500);
    }

    this.emit(OccupancyEvents.occupancy, {
      connections: connections,
      presenceMembers: presenceMembers,
    });
  }
}
