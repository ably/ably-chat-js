import Ably from 'ably';
import { DEFAULT_CHANNEL_OPTIONS } from './version.js';

export const ROOM_REACTION_REALTIME_MESSAGE_NAME = 'roomReaction';

/**
 * Represents a room-level reaction.
 */
export interface Reaction {
  // type of the reaction, such as "like", "love", etc.
  type: string;

  // metadata of the reaction, if any was set
  metadata?: any;

  // timestamp of when this reaction was sent
  createdAt: Date;

  // clientId of the user who sent this reaction
  clientId: string;

  // true if the current user sent this reaction
  isSelf: boolean;
}

export type RoomReactionListener = (reaction: Reaction) => void;

/**
 * Object used to send and subscribe to room-level reactions.
 * 
 * Get an instance via room.reactions.
 */
export interface RoomReactions {
  send(type: string): Promise<void>;
  send(type: string, metadata?: any): Promise<void>;

  subscribe(listener: RoomReactionListener): Promise<Ably.ChannelStateChange | null> | undefined;
  unsubscribe(listener: RoomReactionListener): Promise<void>;

  get realtimeChannelName(): string;
  get channel(): Ably.RealtimeChannel;
}

export class DefaultRoomReactions implements RoomReactions {
  private readonly roomId: string;
  private readonly _channel: Ably.RealtimeChannel;
  private readonly clientId: string;
  private listeners = new Map<RoomReactionListener, Ably.messageCallback<Ably.InboundMessage>>();

  constructor(roomId: string, realtime: Ably.Realtime, clientId: string) {
    this.roomId = roomId;
    this._channel = realtime.channels.get(this.realtimeChannelName, DEFAULT_CHANNEL_OPTIONS);
    this.clientId = clientId;
  }

  send(type: string, metadata?: any): Promise<void> {
    const payload: any = { type: type };
    if (metadata) {
      payload.metadata = metadata;
    }
    return this._channel.publish(ROOM_REACTION_REALTIME_MESSAGE_NAME, payload);
  }

  subscribe(listener: RoomReactionListener) {
    if (this.listeners.has(listener)) {
      return;
    }
    const clientId = this.clientId;
    const forwarder = function (inbound: Ably.InboundMessage) {
      const reaction = realtime2reaction(inbound, clientId);
      if (!reaction) {
        // ignore non-reactions
        return;
      }
      listener(reaction);
    };
    this.listeners.set(listener, forwarder);
    return this._channel.subscribe(ROOM_REACTION_REALTIME_MESSAGE_NAME, forwarder);
  }

  unsubscribe(listener: RoomReactionListener) {
    const forwarder = this.listeners.get(listener);
    if (!forwarder) {
      return Promise.resolve();
    }
    this._channel.unsubscribe(forwarder);
    this.listeners.delete(listener);
    if (this.listeners.size === 0) {
      return this._channel.detach();
    }
    return Promise.resolve();
  }

  get realtimeChannelName(): string {
    return this.roomId + '::$chat::$reactions';
  }

  get channel(): Ably.RealtimeChannel {
    return this._channel;
  }
}

function realtime2reaction(inbound: Ably.InboundMessage, clientId: string): Reaction | null {
  if (!inbound.data || !inbound.data.type || typeof inbound.data.type !== 'string') {
    // not a reaction if there's no type or type is not a string
    return null;
  }
  if (!inbound.clientId) {
    // not a reaction if we have no clientId
    return null;
  }

  const reaction: Reaction = {
    type: inbound.data.type,
    clientId: inbound.clientId!,
    createdAt: new Date(inbound.timestamp),
    isSelf: inbound.clientId === clientId,
  };

  if (inbound.data.metadata) {
    reaction.metadata = inbound.data.metadata;
  }

  return reaction;
}
