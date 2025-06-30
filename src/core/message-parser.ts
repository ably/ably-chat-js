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

  if (!message.data) {
    throw new Ably.ErrorInfo(`received incoming message without data`, 50000, 500);
  }

  if (!message.clientId) {
    throw new Ably.ErrorInfo(`received incoming message without clientId`, 50000, 500);
  }

  if (!message.extras) {
    throw new Ably.ErrorInfo(`received incoming message without extras`, 50000, 500);
  }

  // For non-delete messages, text is required
  if (message.action !== ChatMessageAction.MessageDelete && message.data.text === undefined) {
    throw new Ably.ErrorInfo(`received incoming message without text`, 50000, 500);
  }

  // For non-delete messages, extras.headers is required
  if (message.action !== ChatMessageAction.MessageDelete && !message.extras.headers) {
    throw new Ably.ErrorInfo(`received incoming message without headers`, 50000, 500);
  }

  // For non-delete messages, metadata is required
  if (message.action !== ChatMessageAction.MessageDelete && !message.data.metadata) {
    throw new Ably.ErrorInfo(`received incoming message without metadata`, 50000, 500);
  }

  if (!message.serial) {
    throw new Ably.ErrorInfo(`received incoming message without serial`, 50000, 500);
  }

  if (!message.version) {
    throw new Ably.ErrorInfo(`received incoming message without version`, 50000, 500);
  }

  if (!message.createdAt) {
    throw new Ably.ErrorInfo(`received incoming message without createdAt`, 50000, 500);
  }

  if (!message.timestamp) {
    throw new Ably.ErrorInfo(`received incoming message without timestamp`, 50000, 500);
  }

  switch (message.action) {
    case ChatMessageAction.MessageCreate:
    case ChatMessageAction.MessageUpdate:
    case ChatMessageAction.MessageDelete: {
      break;
    }
    default: {
      throw new Ably.ErrorInfo(`received incoming message with unhandled action; ${message.action}`, 50000, 500);
    }
  }

  // If it's a deleted message, we'll set message.data to an empty object and message.extras to an empty object
  const data = message.action === ChatMessageAction.MessageDelete ? {} : message.data;
  const extras = message.action === ChatMessageAction.MessageDelete ? {} : message.extras;

  return new DefaultMessage({
    serial: message.serial,
    clientId: message.clientId,
    text: data.text ?? '',
    metadata: data.metadata ?? {},
    headers: extras.headers ?? {},
    action: message.action as ChatMessageAction,
    version: message.version,
    createdAt: new Date(message.createdAt),
    timestamp: new Date(message.timestamp),
    reactions: emptyMessageReactions(),
    operation: message.operation as Operation,
  });
};
