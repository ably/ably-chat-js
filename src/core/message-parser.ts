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

  return new DefaultMessage(
    message.serial,
    message.clientId,
    roomId,
    message.data.text,
    message.data.metadata ?? {},
    message.extras.headers ?? {},
    message.action as ChatMessageActions,
    message.version,
    new Date(message.createdAt),
    new Date(message.timestamp),
    message.operation as Operation,
  );
}
