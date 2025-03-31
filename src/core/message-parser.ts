import * as Ably from 'ably';

import { ChatMessageActions } from './events.js';
import { DefaultMessage, Message, MessageHeaders, MessageMetadata, Operation } from './message.js';

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
export function parseMessage(roomId: string | undefined, inboundMessage: Ably.InboundMessage): Message {
  const message = inboundMessage as MessagePayload;

  if (!roomId) {
    throw new Ably.ErrorInfo(`received incoming message without roomId`, 50000, 500);
  }

  if (!message.data) {
    throw new Ably.ErrorInfo(`received incoming message without data`, 50000, 500);
  }

  if (!message.clientId) {
    throw new Ably.ErrorInfo(`received incoming message without clientId`, 50000, 500);
  }

  if (message.data.text === undefined) {
    throw new Ably.ErrorInfo(`received incoming message without text`, 50000, 500);
  }

  if (!message.extras) {
    throw new Ably.ErrorInfo(`received incoming message without extras`, 50000, 500);
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
    case ChatMessageActions.MessageCreate:
    case ChatMessageActions.MessageUpdate:
    case ChatMessageActions.MessageDelete: {
      break;
    }
    default: {
      throw new Ably.ErrorInfo(`received incoming message with unhandled action; ${message.action}`, 50000, 500);
    }
  }

  return new DefaultMessage({
    serial: message.serial,
    clientId: message.clientId,
    roomId: roomId,
    text: message.data.text,
    metadata: message.data.metadata ?? {},
    headers: message.extras.headers ?? {},
    action: message.action as ChatMessageActions,
    version: message.version,
    createdAt: new Date(message.createdAt),
    timestamp: new Date(message.timestamp),
    operation: message.operation as Operation,
  });
}
