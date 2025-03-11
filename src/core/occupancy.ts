import * as Ably from 'ably';

import { roomChannelName } from './channel.js';
import { ChannelManager, ChannelOptionsMerger } from './channel-manager.js';
import { ChatApi } from './chat-api.js';
import { ErrorCodes } from './errors.js';
import { Logger } from './logger.js';
import { Subscription } from './subscription.js';
import EventEmitter from './utils/event-emitter.js';

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
export class DefaultOccupancy extends EventEmitter<OccupancyEventsMap> implements Occupancy {
  private readonly _roomId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly _chatApi: ChatApi;
  private _logger: Logger;

  /**
   * Constructs a new `DefaultOccupancy` instance.
   * @param roomId The unique identifier of the room.
   * @param channelManager An instance of the ChannelManager.
   * @param chatApi An instance of the ChatApi.
   * @param logger An instance of the Logger.
   */
  constructor(roomId: string, channelManager: ChannelManager, chatApi: ChatApi, logger: Logger) {
    super();

    this._roomId = roomId;
    this._channel = this._makeChannel(channelManager);
    this._chatApi = chatApi;
    this._logger = logger;
  }

  /**
   * Creates the realtime channel for occupancy.
   */
  private _makeChannel(channelManager: ChannelManager): Ably.RealtimeChannel {
    const channel = channelManager.get();

    // attachOnSubscribe is set to false in the default channel options, so this call cannot fail
    void channel.subscribe(['[meta]occupancy'], this._internalOccupancyListener.bind(this));

    return channel;
  }

  /**
   * @inheritdoc Occupancy
   */
  subscribe(listener: OccupancyListener): Subscription {
    this._logger.trace('Occupancy.subscribe();');
    this.on(listener);

    return {
      unsubscribe: () => {
        this._logger.trace('Occupancy.unsubscribe();');
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
    return this._chatApi.getOccupancy(this._roomId);
  }

  /**
   * An internal listener that listens for occupancy events from the underlying channel and translates them into
   * occupancy events for the public API.
   */
  private _internalOccupancyListener(message: Ably.InboundMessage): void {
    this._logger.debug('received occupancy event');
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

    this._logger.debug('emitting occupancy update');
    this.emit(OccupancyEvents.Occupancy, {
      connections: connections,
      presenceMembers: presenceMembers,
    });
  }

  /**
   * @inheritdoc ContributesToRoomLifecycle
   */
  get attachmentErrorCode(): ErrorCodes {
    return ErrorCodes.OccupancyAttachmentFailed;
  }

  /**
   * @inheritdoc ContributesToRoomLifecycle
   */
  get detachmentErrorCode(): ErrorCodes {
    return ErrorCodes.OccupancyDetachmentFailed;
  }

  /**
   * Merges the channel options for the room with the ones required for presence.
   *
   * @param roomOptions The room options to merge for.
   * @returns A function that merges the channel options for the room with the ones required for presence.
   */
  static channelOptionMerger(): ChannelOptionsMerger {
    return (options) => ({ ...options, params: { ...options.params, occupancy: 'metrics' } });
  }

  /**
   * Returns the channel name for the presence channel.
   *
   * @param roomId The unique identifier of the room.
   * @returns The channel name for the presence channel.
   */
  static channelName(roomId: string): string {
    return roomChannelName(roomId);
  }
}
