/**
 * @module chat-js
 */

export { ChatClient } from './chat.js';
export type { ClientOptions } from './config.js';
export type { Connection } from './connection.js';
export type {
  ConnectionLifecycle,
  ConnectionStatus,
  ConnectionStatusChange,
  ConnectionStatusListener,
  OnConnectionStatusChangeResponse,
} from './connection-status.js';
export type { DiscontinuityListener, OnDiscontinuitySubscriptionResponse } from './discontinuity.js';
export type { ErrorCodes } from './errors.js';
export { MessageEvents, PresenceEvents } from './events.js';
export type { Headers } from './headers.js';
export type { LogContext, LogHandler } from './logger.js';
export { LogLevel } from './logger.js';
export type { Message, MessageHeaders, MessageMetadata } from './message.js';
export type {
  MessageEventPayload,
  MessageListener,
  Messages,
  MessageSubscriptionResponse,
  QueryOptions,
  SendMessageParams,
} from './messages.js';
export type { Metadata } from './metadata.js';
export type { Occupancy, OccupancyEvent, OccupancyListener, OccupancySubscriptionResponse } from './occupancy.js';
export type {
  Presence,
  PresenceData,
  PresenceEvent,
  PresenceListener,
  PresenceMember,
  PresenceSubscriptionResponse,
} from './presence.js';
export type { PaginatedResult } from './query.js';
export type { Reaction } from './reaction.js';
export type { Room } from './room.js';
export type {
  OccupancyOptions,
  PresenceOptions,
  RoomOptions,
  RoomReactionsOptions,
  TypingOptions,
} from './room-options.js';
export { RoomOptionsDefaults } from './room-options.js';
export type {
  RoomReactionListener,
  RoomReactions,
  RoomReactionsSubscriptionResponse,
  SendReactionParams,
} from './room-reactions.js';
export type {
  OnRoomStatusChangeResponse,
  RoomLifecycle,
  RoomStatus,
  RoomStatusChange,
  RoomStatusListener,
} from './room-status.js';
export type { Rooms } from './rooms.js';
export type { Typing, TypingEvent, TypingListener, TypingSubscriptionResponse } from './typing.js';
export type { ChannelStateChange, ErrorInfo, RealtimePresenceParams } from 'ably';
