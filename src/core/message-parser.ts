import * as Ably from 'ably';

import { DefaultMessage, Message, MessageHeaders, MessageMetadata } from './message.js';

interface MessagePayload {
  data?: {
    text?: string;
    metadata?: MessageMetadata;
  };
  clientId?: string;
  timestamp: number;
  extras?: {
    timeserial?: string;
    headers?: MessageHeaders;
  };
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

  if (!messageCreatedMessage.extras.timeserial) {
    throw new Ably.ErrorInfo(`received incoming message without timeserial`, 50000, 500);
  }

  return new DefaultMessage(
    messageCreatedMessage.extras.timeserial,
    messageCreatedMessage.clientId,
    roomId,
    messageCreatedMessage.data.text,
    new Date(messageCreatedMessage.timestamp),
    messageCreatedMessage.data.metadata ?? {},
    messageCreatedMessage.extras.headers ?? {},
  );
}
