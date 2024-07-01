import * as Ably from 'ably';

import { getChannel } from './channel.js';
import { ChatApi } from './ChatApi.js';
import {
  DiscontinuityEmitter,
  DiscontinuityListener,
  EmitsDiscontinuities,
  HandlesDiscontinuity,
  newDiscontinuityEmitter,
  OnDiscontinuitySubscriptionResponse,
} from './discontinuity.js';
import { Logger } from './logger.js';
import { addListenerToChannelWithoutAttach } from './realtimeextensions.js';
import EventEmitter from './utils/EventEmitter.js';

/**
 * Represents the occupancy (number of connections, publishers, and subscribers) of a chat room.
 */
export interface Occupancy extends EmitsDiscontinuities {
  /**
   * Subscribe a given listener to occupancy updates of the chat room.
   *
   * @param listener A listener to be called when the occupancy of the room changes.
   * @returns A promise resolves to the channel attachment state change event from the implicit channel attach operation.
   */
  subscribe(listener: OccupancyListener): OccupancySubscriptionResponse;

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
 * A response object that allows you to control an occupany update subscription.
 */
export interface OccupancySubscriptionResponse {
  /**
   * Unsubscribe the listener registered with {@link Occupancy.subscribe} from occupancy updates.
   */
  unsubscribe: () => void;
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

export class DefaultOccupancy extends EventEmitter<OccupancyEventsMap> implements Occupancy, HandlesDiscontinuity {
  private readonly roomId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _chatApi: ChatApi;
  private _logger: Logger;
  private _discontinuityEmitter: DiscontinuityEmitter = newDiscontinuityEmitter();

  constructor(roomId: string, realtime: Ably.Realtime, chatApi: ChatApi, logger: Logger) {
    super();
    this.roomId = roomId;
    this._channel = getChannel(`${roomId}::$chat::$chatMessages`, realtime, { params: { occupancy: 'metrics' } });
    addListenerToChannelWithoutAttach({
      listener: this.internalOccupancyListener.bind(this),
      events: ['[meta]occupancy'],
      channel: this._channel,
    });
    this._chatApi = chatApi;
    this._logger = logger;
  }

  /**
   * @inheritdoc Occupancy
   */
  subscribe(listener: OccupancyListener): OccupancySubscriptionResponse {
    this._logger.trace('Occupancy.subscribe();');
    this.on(listener);

    return {
      unsubscribe: () => {
        this.off(listener);
      },
    };
  }

  /**
   * @inheritdoc Occupancy
   */
  unsubscribeAll(): void {
    this._logger.trace('Occupancy.unsubscribeAll();');
    this.off();
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
    if (typeof message.data !== 'object') {
      this._logger.error('invalid occupancy event received; data is not an object', message);
      return;
    }

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

    if (typeof connections !== 'number' || !Number.isInteger(connections)) {
      this._logger.error('invalid occupancy event received; connections is not a number', message);
      return;
    }

    if (presenceMembers === undefined) {
      this._logger.error('invalid occupancy event received; presenceMembers is missing', message);
      return;
    }

    if (typeof presenceMembers !== 'number' || !Number.isInteger(presenceMembers)) {
      this._logger.error('invalid occupancy event received; presenceMembers is not a number', message);
      return;
    }

    this.emit(OccupancyEvents.occupancy, {
      connections: connections,
      presenceMembers: presenceMembers,
    });
  }

  onDiscontinuity(listener: DiscontinuityListener): OnDiscontinuitySubscriptionResponse {
    this._logger.trace('Occupancy.onDiscontinuity();');
    this._discontinuityEmitter.on(listener);

    return {
      off: () => {
        this._discontinuityEmitter.off(listener);
      },
    };
  }
  discontinuityDetected(error?: Ably.ErrorInfo | undefined): void {
    this._logger.warn('Occupancy.discontinuityDetected();', { error });
    this._discontinuityEmitter.emit('discontinuity', error);
  }
}
