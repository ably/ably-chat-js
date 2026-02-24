/**
 * @module chat-js
 */

export { ChatClient } from './chat-client.js';
export type { ChatClientOptions } from './config.js';
export type { Connection, ConnectionStatusChange, ConnectionStatusListener } from './connection.js';
export { ConnectionStatus } from './connection.js';
export type { DiscontinuityListener } from './discontinuity.js';
export { ErrorCode, errorInfoIs } from './errors.js';
export type {
  ChatMessageEvent,
  MessageReactionRawEvent,
  MessageReactionSummaryEvent,
  OccupancyEvent,
  RoomReactionEvent,
  RoomReactionEventType,
  RoomReactionRealtimeEventType,
  TypingSetEvent,
} from './events.js';
export {
  ChatMessageAction,
  ChatMessageEventType,
  MessageReactionRawEventType,
  MessageReactionSummaryEventType,
  MessageReactionType,
  OccupancyEventType,
  PresenceEventType,
  RoomEventType,
  TypingEventType,
  TypingSetEventType,
} from './events.js';
export type { Headers } from './headers.js';
export type { JsonArray, JsonObject, JsonValue } from './json.js';
export type { LogContext, Logger, LogHandler } from './logger.js';
export { LogLevel } from './logger.js';
export type {
  Message,
  MessageCopyParams,
  MessageHeaders,
  MessageMetadata,
  MessageOperationMetadata,
  MessageReactionSummary,
  MessageVersion,
} from './message.js';
export type {
  DeleteMessageReactionParams,
  MessageRawReactionListener,
  MessageReactionListener,
  MessageReactions,
  SendMessageReactionParams,
} from './message-reactions.js';
export type {
  HistoryParams,
  MessageListener,
  Messages,
  MessageSubscriptionResponse,
  OperationDetails,
  SendMessageParams,
  UpdateMessageParams,
} from './messages.js';
export { OrderBy } from './messages.js';
export type { Metadata } from './metadata.js';
export type { Occupancy, OccupancyListener } from './occupancy.js';
export type { OccupancyData } from './occupancy-parser.js';
export type { OperationMetadata } from './operation-metadata.js';
export type { Presence, PresenceData, PresenceEvent, PresenceListener, PresenceMember } from './presence.js';
export type { PaginatedResult } from './query.js';
export type { Room } from './room.js';
export type { MessagesOptions, OccupancyOptions, PresenceOptions, RoomOptions, TypingOptions } from './room-options.js';
export type { RoomReaction, RoomReactionHeaders, RoomReactionMetadata } from './room-reaction.js';
export type { RoomReactionListener, RoomReactions, SendReactionParams } from './room-reactions.js';
export type { RoomStatusChange, RoomStatusListener } from './room-status.js';
export { RoomStatus } from './room-status.js';
export type { Rooms } from './rooms.js';
export type { StatusSubscription, Subscription } from './subscription.js';
export type { Typing, TypingListener, TypingMember } from './typing.js';
export type { ErrorInfo, RealtimePresenceParams } from 'ably';
