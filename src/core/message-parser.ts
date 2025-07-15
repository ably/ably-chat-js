import * as Ably from 'ably';

import { ChatMessageAction } from './events.js';
import {
  DefaultMessage,
  emptyMessageReactions,
  Message,
  MessageHeaders,
  MessageMetadata,
  Operation,
} from './message.js';

interface MessagePayload {
  data?: {
    text?: string;
    metadata?: MessageMetadata;
  };
  clientId?: string;
  timestamp: number;
  extras?: {
    headers?: MessageHeaders;
  };

  serial: string;
  createdAt: number;
  version: string;
  action: Ably.MessageAction;
  operation?: Ably.Operation;
}

// Parse a realtime message to a chat message
export const parseMessage = (inboundMessage: Ably.InboundMessage): Message => {
  const message = inboundMessage as MessagePayload;

  // Provide default values for all fields
  const data = message.data && typeof message.data === 'object' ? message.data : {};
  const extras = message.extras && typeof message.extras === 'object' ? message.extras : {};
  const clientId = message.clientId || '';
  const text = data.text || '';
  const serial = message.serial || '';
  const version = message.version || '';
  const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const headers = extras.headers || {};

  // Use current time as default for missing timestamps
  const currentTime = Date.now();
  const createdAt = new Date(message.createdAt || currentTime);
  const timestamp = new Date(message.timestamp || currentTime);

  // Convert the action to a ChatMessageAction enum, defaulting to MessageCreate if the action is not found.
  const action = Object.values(ChatMessageAction).includes(message.action as ChatMessageAction)
    ? (message.action as ChatMessageAction)
    : ChatMessageAction.MessageCreate;

  return new DefaultMessage({
    serial,
    clientId,
    text,
    metadata,
    headers,
    action,
    version,
    createdAt,
    timestamp,
    reactions: emptyMessageReactions(),
    operation: message.operation as Operation,
  });
};
