import { ChatMessageAction } from './events.js';
import {
  DefaultMessage,
  emptyMessageReactions,
  Message,
  MessageHeaders,
  MessageMetadata,
  MessageReactions,
} from './message.js';

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
  'reaction:unique.v1'?: Record<string, RestClientIdList>;
  'reaction:distinct.v1'?: Record<string, RestClientIdList>;
  'reaction:multiple.v1'?: Record<string, RestClientIdCounts>;
}

// RestMessage represents a message in V3 of the REST API.
export interface RestMessage {
  serial: string;
  version: string;
  roomId: string;
  text: string;
  clientId: string;
  action: string;
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
  const metadata = message.metadata as MessageMetadata | undefined;
  const headers = message.headers as MessageHeaders | undefined;
  const reactions = message.reactions;

  let chatReactions: MessageReactions = emptyMessageReactions();
  if (reactions) {
    chatReactions = {
      unique: reactions['reaction:unique.v1'] ?? {},
      distinct: reactions['reaction:distinct.v1'] ?? {},
      multiple: reactions['reaction:multiple.v1'] ?? {},
    };
  }

  return new DefaultMessage({
    ...message,
    action: message.action as ChatMessageAction,
    metadata: metadata ?? {},
    headers: headers ?? {},
    createdAt: new Date(message.createdAt),
    timestamp: new Date(message.timestamp),
    reactions: chatReactions,
  });
};
