import * as Ably from 'ably';

import { ChatMessageAction } from './events.js';
import { DefaultMessage, emptyMessageReactions, Message, MessageMetadata } from './message.js';
import { realtimeExtras } from './realtime-extensions.js';

interface MessagePayload {
  data?: {
    text?: string;
    metadata?: MessageMetadata;
  };
  clientId?: string;
  timestamp: number;
  serial: string;
  action: Ably.MessageAction;
  version: Ably.MessageVersion;
  annotations: Ably.MessageAnnotations;
}

// Parse a realtime message to a chat message
export const parseMessage = (inboundMessage: Ably.InboundMessage): Message => {
  const message = inboundMessage as MessagePayload;

  // Provide default values for all fields
  const data = message.data && typeof message.data === 'object' ? message.data : {};
  const extras = realtimeExtras(inboundMessage.extras);
  const clientId = message.clientId || '';
  const text = data.text || '';
  // Spec: CHA-M4k5
  const timestamp = new Date(message.timestamp || 0);
  const serial = message.serial || '';
  const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const headers = extras.headers || {};
  const userClaim = extras.userClaim;

  // Create the version, using defaults as required
  const version = {
    ...message.version,
    // Spec: CHA-M4k6
    serial: message.version.serial || serial,
    // Spec: CHA-M4k7
    timestamp: new Date(message.version.timestamp || timestamp),
  };

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
    userClaim,
    action,
    version,
    timestamp,
    reactions: emptyMessageReactions(),
  });
};
