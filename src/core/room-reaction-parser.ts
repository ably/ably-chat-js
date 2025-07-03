import * as Ably from 'ably';

import { DefaultRoomReaction, RoomReaction, RoomReactionHeaders, RoomReactionMetadata } from './room-reaction.js';

interface ReactionPayload {
  data?: {
    type: unknown;
    metadata?: RoomReactionMetadata;
  };
  clientId?: string;
  timestamp: number;
  extras?: {
    headers?: RoomReactionHeaders;
  };
}

export function parseRoomReaction(message: Ably.InboundMessage, clientId?: string): RoomReaction {
  const reactionCreatedMessage = message as ReactionPayload;
  if (!reactionCreatedMessage.data) {
    throw new Ably.ErrorInfo(`received incoming room reaction message without data`, 50000, 500);
  }

  if (!reactionCreatedMessage.data.type || typeof reactionCreatedMessage.data.type !== 'string') {
    throw new Ably.ErrorInfo('invalid room reaction message with no type', 50000, 500);
  }

  if (!reactionCreatedMessage.clientId) {
    throw new Ably.ErrorInfo(`received incoming room reaction message without clientId`, 50000, 500);
  }

  if (!reactionCreatedMessage.timestamp) {
    throw new Ably.ErrorInfo(`received incoming room reaction message without timestamp`, 50000, 500);
  }

  return new DefaultRoomReaction(
    reactionCreatedMessage.data.type,
    reactionCreatedMessage.clientId,
    new Date(reactionCreatedMessage.timestamp),
    clientId ? clientId === reactionCreatedMessage.clientId : false,
    reactionCreatedMessage.data.metadata ?? {},
    reactionCreatedMessage.extras?.headers ?? {},
  );
}
