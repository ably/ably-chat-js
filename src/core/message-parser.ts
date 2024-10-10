import * as Ably from 'ably';

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

export function parseMessage(roomId: string | undefined, message: Ably.InboundMessage): Message {
  const messageCreatedMessage = message as MessagePayload;
  if (!roomId) {
    throw new Ably.ErrorInfo(`received incoming message without roomId`, 50000, 500);
  }

  if (!messageCreatedMessage.data) {
    throw new Ably.ErrorInfo(`received incoming message without data`, 50000, 500);
  }

  if (!messageCreatedMessage.clientId) {
    throw new Ably.ErrorInfo(`received incoming message without clientId`, 50000, 500);
  }

  if (!messageCreatedMessage.timestamp) {
    throw new Ably.ErrorInfo(`received incoming message without timestamp`, 50000, 500);
  }

  if (messageCreatedMessage.data.text === undefined) {
    throw new Ably.ErrorInfo(`received incoming message without text`, 50000, 500);
  }

  if (!messageCreatedMessage.extras) {
    throw new Ably.ErrorInfo(`received incoming message without extras`, 50000, 500);
  }

  if (!messageCreatedMessage.serial) {
    throw new Ably.ErrorInfo(`received incoming message without timeserial`, 50000, 500);
  }

  let operationDetails: MessageDetails | undefined;
  if (messageCreatedMessage.operation) {
    operationDetails = {
      description: messageCreatedMessage.operation.description,
      metadata: messageCreatedMessage.operation.metadata,
    };
  }

  const newMessage: ChatMessageFields = {
    timeserial: messageCreatedMessage.serial,
    clientId: messageCreatedMessage.clientId,
    roomId,
    text: messageCreatedMessage.data.text,
    createdAt: new Date(messageCreatedMessage.timestamp),
    metadata: messageCreatedMessage.data.metadata ?? {},
    headers: messageCreatedMessage.extras.headers ?? {},
  };

  switch (messageCreatedMessage.action) {
    case 'MESSAGE_CREATE': {
      break;
    }
    case 'MESSAGE_UPDATE': {
      if (!messageCreatedMessage.updatedAt) {
        throw new Ably.ErrorInfo(`received incoming update message without updatedAt`, 50000, 500);
      }
      newMessage.updatedAt = messageCreatedMessage.updatedAt ? new Date(messageCreatedMessage.updatedAt) : undefined;
      newMessage.updatedBy = messageCreatedMessage.operation?.clientId;
      newMessage.updateDetail = operationDetails;
      break;
    }
    case 'MESSAGE_DELETE': {
      if (!messageCreatedMessage.deletedAt) {
        throw new Ably.ErrorInfo(`received incoming deletion message without deletedAt`, 50000, 500);
      }
      newMessage.deletedAt = messageCreatedMessage.deletedAt ? new Date(messageCreatedMessage.deletedAt) : undefined;
      newMessage.deletedBy = messageCreatedMessage.operation?.clientId;
      newMessage.deletionDetail = operationDetails;
      break;
    }
    default: {
      throw new Ably.ErrorInfo(
        `received incoming message with unhandled action; ${messageCreatedMessage.action}`,
        50000,
        500,
      );
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
