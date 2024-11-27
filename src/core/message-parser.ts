import * as Ably from 'ably';

import { ChatMessageActions } from './events.js';
import { DefaultMessage, Message, MessageActionDetails, MessageHeaders, MessageMetadata } from './message.js';

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
  version?: string;
  action: Ably.MessageAction;
  operation?: Ably.Operation;
}

interface ChatMessageFields {
  serial: string;
  clientId: string;
  roomId: string;
  text: string;
  metadata: MessageMetadata;
  headers: MessageHeaders;
  createdAt: Date;
  latestAction: ChatMessageActions;
  latestActionSerial: string;
  updatedAt?: Date;
  deletedAt?: Date;
  operation?: MessageActionDetails;
}

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

  const newMessage: ChatMessageFields = {
    serial: message.serial,
    clientId: message.clientId,
    roomId,
    text: message.data.text,
    metadata: message.data.metadata ?? {},
    headers: message.extras.headers ?? {},
    createdAt: new Date(message.createdAt),
    latestAction: message.action as ChatMessageActions,
    latestActionSerial: message.version ?? message.serial,
    updatedAt: message.timestamp ? new Date(message.timestamp) : undefined,
    deletedAt: message.timestamp ? new Date(message.timestamp) : undefined,
    operation: message.operation as MessageActionDetails,
  };

  switch (message.action) {
    case ChatMessageActions.MessageCreate: {
      break;
    }
    case ChatMessageActions.MessageUpdate:
    case ChatMessageActions.MessageDelete: {
      if (!message.version) {
        throw new Ably.ErrorInfo(`received incoming ${message.action} without version`, 50000, 500);
      }
      break;
    }
    default: {
      throw new Ably.ErrorInfo(`received incoming message with unhandled action; ${message.action}`, 50000, 500);
    }
  }
  return new DefaultMessage(
    newMessage.serial,
    newMessage.clientId,
    newMessage.roomId,
    newMessage.text,
    newMessage.metadata,
    newMessage.headers,
    newMessage.createdAt,
    newMessage.latestAction,
    newMessage.latestActionSerial,
    newMessage.latestAction === ChatMessageActions.MessageDelete ? newMessage.deletedAt : undefined,
    newMessage.latestAction === ChatMessageActions.MessageUpdate ? newMessage.updatedAt : undefined,
    newMessage.operation,
  );
}
