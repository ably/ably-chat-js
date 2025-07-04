import { ChatMessageAction } from './events.js';
import { DefaultMessage, emptyMessageReactions, Message } from './message.js';

// RestClientIdList represents a list of client IDs with aggregation data
export interface RestClientIdList {
  total: number;
  clientIds: string[];
}

// RestClientIdCounts represents client ID counts with aggregation data
export interface RestClientIdCounts {
  total: number;
  clientIds: Record<string, number>;
  totalUnidentified: number;
}

// RestOperation represents an operation performed on a chat message
export interface RestOperation {
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

// RestMessage represents a message in V3 of the REST API.
export interface RestMessage {
  serial: string;
  version: string;
  text: string;
  clientId: string;
  action: 'message.create' | 'message.update' | 'message.delete';
  metadata: Record<string, unknown>;
  headers: Record<string, string>;
  createdAt: number;
  timestamp: number;
  operation?: RestOperation;
  reactions?: RestChatMessageReactions;
}

/**
 * Converts a message object from its REST representation to the standard message object in the SDK.
 *
 * @param message The message to convert from REST.
 * @returns The converted message.
 */
export const messageFromRest = (message: RestMessage): Message => {
  const reactions = {
    ...emptyMessageReactions(),
    ...message.reactions,
  };

  // Convert the action to a ChatMessageAction enum, defaulting to MessageCreate if the action is not found.
  const action = Object.values(ChatMessageAction).includes(message.action as ChatMessageAction)
    ? (message.action as ChatMessageAction)
    : ChatMessageAction.MessageCreate;

  return new DefaultMessage({
    ...message,
    action,
    createdAt: new Date(message.createdAt),
    timestamp: new Date(message.timestamp),
    reactions: reactions,
  });
};
