import * as Ably from 'ably';

import { DefaultReaction, Reaction, ReactionHeaders, ReactionMetadata } from './reaction.js';

interface ReactionPayload {
  data?: {
    type: string;
    metadata?: ReactionMetadata;
  };
  clientId?: string;
  timestamp: number;
  extras?: {
    headers?: ReactionHeaders;
  };
}

export function parseReaction(message: Ably.InboundMessage, clientId?: string): Reaction {
  const reactionCreatedMessage = message as ReactionPayload;
  if (!reactionCreatedMessage.data) {
    throw new Ably.ErrorInfo(`received incoming message without data`, 50000, 500);
  }

  if (!reactionCreatedMessage.data.type || typeof reactionCreatedMessage.data.type !== 'string') {
    throw new Ably.ErrorInfo('invalid reaction message with no type', 50000, 500);
  }

  if (!reactionCreatedMessage.clientId) {
    throw new Ably.ErrorInfo(`received incoming message without clientId`, 50000, 500);
  }

  if (!reactionCreatedMessage.timestamp) {
    throw new Ably.ErrorInfo(`received incoming message without timestamp`, 50000, 500);
  }

  return new DefaultReaction(
    reactionCreatedMessage.data.type,
    reactionCreatedMessage.clientId,
    new Date(reactionCreatedMessage.timestamp),
    clientId ? clientId === reactionCreatedMessage.clientId : false,
    reactionCreatedMessage.data.metadata ?? {},
    reactionCreatedMessage.extras?.headers ?? {},
  );
}
