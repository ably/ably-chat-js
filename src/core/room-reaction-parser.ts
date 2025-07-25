import * as Ably from 'ably';

import { DefaultRoomReaction, RoomReaction, RoomReactionHeaders, RoomReactionMetadata } from './room-reaction.js';

interface ReactionPayload {
  data?: {
    name?: string;
    metadata?: RoomReactionMetadata;
  };
  clientId?: string;
  timestamp: number;
  extras?: {
    headers?: RoomReactionHeaders;
  };
}

/**
 * Parses a room reaction from an inbound message.
 * @param message The inbound message containing the reaction data.
 * @param clientId The client ID of the user.
 * @returns The parsed room reaction.
 */
export const parseRoomReaction = (message: Ably.InboundMessage, clientId?: string): RoomReaction => {
  const reactionCreatedMessage = message as ReactionPayload;

  // Use empty string if type is missing or invalid
  const name =
    reactionCreatedMessage.data?.name && typeof reactionCreatedMessage.data.name === 'string'
      ? reactionCreatedMessage.data.name
      : '';

  // Use empty string if clientId is missing
  const messageClientId = reactionCreatedMessage.clientId ?? '';

  // Use current time if timestamp is missing
  const timestamp = reactionCreatedMessage.timestamp ? new Date(reactionCreatedMessage.timestamp) : new Date();

  return new DefaultRoomReaction(
    name,
    messageClientId,
    timestamp,
    clientId ? clientId === messageClientId : false,
    reactionCreatedMessage.data?.metadata ?? {},
    reactionCreatedMessage.extras?.headers ?? {},
  );
};
