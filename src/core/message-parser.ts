import * as Ably from 'ably';

import { ChatMessageActions } from './events.js';
import { DefaultMessage, Message, MessageDetails, MessageHeaders, MessageMetadata } from './message.js';

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
  updatedAt?: number;
  deletedAt?: number;
  action: Ably.MessageAction;
  operation?: Ably.Operation;
}

interface ChatMessageFields {
  timeserial: string;
  clientId: string;
  roomId: string;
  text: string;
  createdAt: Date;
  metadata: MessageMetadata;
  headers: MessageHeaders;
  deletedAt?: Date;
  deletedBy?: string;
  deletionDetail?: MessageDetails;
  updatedAt?: Date;
  updatedBy?: string;
  updateDetail?: MessageDetails;
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

  if (!message.timestamp) {
    throw new Ably.ErrorInfo(`received incoming message without timestamp`, 50000, 500);
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

  let operationDetails: MessageDetails | undefined;
  if (message.operation) {
    operationDetails = {
      description: message.operation.description,
      metadata: message.operation.metadata,
    };
  }

  const newMessage: ChatMessageFields = {
    timeserial: message.serial,
    clientId: message.clientId,
    roomId,
    text: message.data.text,
    createdAt: new Date(message.timestamp),
    metadata: message.data.metadata ?? {},
    headers: message.extras.headers ?? {},
    updatedAt: message.updatedAt ? new Date(message.updatedAt) : undefined,
    deletedAt: message.deletedAt ? new Date(message.deletedAt) : undefined,
  };

  switch (message.action) {
    case ChatMessageActions.MessageCreate: {
      break;
    }
    case ChatMessageActions.MessageUpdate: {
      if (!message.updatedAt) {
        throw new Ably.ErrorInfo(`received incoming update message without updatedAt`, 50000, 500);
      }
      newMessage.updatedBy = message.operation?.clientId;
      newMessage.updateDetail = operationDetails;
      break;
    }
    case ChatMessageActions.MessageDelete: {
      if (!message.deletedAt) {
        throw new Ably.ErrorInfo(`received incoming deletion message without deletedAt`, 50000, 500);
      }
      newMessage.deletedBy = message.operation?.clientId;
      newMessage.deletionDetail = operationDetails;
      break;
    }
    default: {
      throw new Ably.ErrorInfo(`received incoming message with unhandled action; ${message.action}`, 50000, 500);
    }
  }
  return new DefaultMessage(
    newMessage.timeserial,
    newMessage.clientId,
    newMessage.roomId,
    newMessage.text,
    newMessage.createdAt,
    newMessage.metadata,
    newMessage.headers,
    newMessage.deletedAt,
    newMessage.deletedBy,
    newMessage.deletionDetail,
    newMessage.updatedAt,
    newMessage.updatedBy,
    newMessage.updateDetail,
  );
}
