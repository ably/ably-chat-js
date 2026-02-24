import { ChatMessageAction } from './events.js';
import { JsonObject } from './json.js';
import { DefaultMessage, emptyMessageReactions, Message, MessageReactionSummary } from './message.js';

// RestClientIdList represents a list of client IDs with aggregation data
export interface RestClientIdList {
  total: number;
  clientIds: string[];
  clipped?: boolean;
}

// RestClientIdCounts represents client ID counts with aggregation data
export interface RestClientIdCounts {
  total: number;
  clientIds: Record<string, number>;
  totalUnidentified: number;
  clipped?: boolean;
  totalClientIds?: number;
}

// RestVersion represents the version information of a message. (i.e. an update or delete)
export interface RestVersion {
  serial: string;
  timestamp: number;
  clientId?: string;
  description?: string;
  metadata?: Record<string, string>;
}

// ChatMessageReactions represents reactions on a chat message
export interface RestChatMessageReactions {
  unique?: Record<string, RestClientIdList>;
  distinct?: Record<string, RestClientIdList>;
  multiple?: Record<string, RestClientIdCounts>;
}

// RestMessage represents a message in V4 of the REST API.
export interface RestMessage {
  serial: string;
  version: RestVersion;
  text: string;
  clientId: string;
  action: 'message.create' | 'message.update' | 'message.delete';
  metadata: JsonObject;
  headers: Record<string, string>;
  userClaim?: string;
  timestamp: number;
  reactions?: RestChatMessageReactions;
}

/**
 * Converts a message object from its REST representation to the standard message object in the SDK.
 * @param message The message to convert from REST.
 * @returns The converted message.
 */
export const messageFromRest = (message: RestMessage): Message => {
  const reactions = {
    ...emptyMessageReactions(),
    ...message.reactions,
  };

  // Iterate through all reaction types and normalize fields
  // For unique and distinct reactions, ensure clipped is explicitly set to false if not present
  for (const reactionType of ['unique', 'distinct']) {
    const reactionTypeData = reactions[reactionType as keyof typeof reactions] as Record<string, RestClientIdList>;
    for (const reactionName of Object.keys(reactionTypeData)) {
      const reaction = reactionTypeData[reactionName];
      if (reaction && !reaction.clipped) {
        reaction.clipped = false;
      }
    }
  }

  // For multiple reactions, ensure clipped is explicitly set to false and totalClientIds is set to zero if not present
  const multipleReactions = reactions.multiple;
  for (const reactionName of Object.keys(multipleReactions)) {
    const reaction = multipleReactions[reactionName];
    if (reaction) {
      if (!reaction.clipped) {
        reaction.clipped = false;
      }
      if (!reaction.totalClientIds) {
        reaction.totalClientIds = 0;
      }
    }
  }

  // Convert the action to a ChatMessageAction enum, defaulting to MessageCreate if the action is not found.
  const action = Object.values(ChatMessageAction).includes(message.action as ChatMessageAction)
    ? (message.action as ChatMessageAction)
    : ChatMessageAction.MessageCreate;

  // Create version information from the message
  const version = {
    serial: message.version.serial,
    timestamp: new Date(message.version.timestamp),
    clientId: message.version.clientId,
    description: message.version.description,
    metadata: message.version.metadata,
  };

  return new DefaultMessage({
    serial: message.serial,
    clientId: message.clientId,
    text: message.text,
    metadata: message.metadata,
    headers: message.headers,
    userClaim: message.userClaim,
    action,
    version,
    timestamp: new Date(message.timestamp),
    reactions: reactions as MessageReactionSummary,
  });
};
