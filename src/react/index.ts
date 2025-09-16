/**
 * @module chat-react
 */

export { type ChatClientContextProviderProps } from './contexts/chat-client-context.js';
export { ChatRoomContext, type ChatRoomContextType } from './contexts/chat-room-context.js';
export { useChatClient } from './hooks/use-chat-client.js';
export { type UseChatClientResponse } from './hooks/use-chat-client.js';
export {
  useChatConnection,
  type UseChatConnectionOptions,
  type UseChatConnectionResponse,
} from './hooks/use-chat-connection.js';
export { useMessages, type UseMessagesParams, type UseMessagesResponse } from './hooks/use-messages.js';
export { useOccupancy, type UseOccupancyParams, type UseOccupancyResponse } from './hooks/use-occupancy.js';
export { usePresence, type UsePresenceParams, type UsePresenceResponse } from './hooks/use-presence.js';
export {
  usePresenceListener,
  type UsePresenceListenerParams,
  type UsePresenceListenerResponse,
} from './hooks/use-presence-listener.js';
export { useRoom, type UseRoomParams, type UseRoomResponse } from './hooks/use-room.js';
export {
  useRoomReactions,
  type UseRoomReactionsParams,
  type UseRoomReactionsResponse,
} from './hooks/use-room-reactions.js';
export { type TypingParams, useTyping, type UseTypingResponse } from './hooks/use-typing.js';
export { ChatClientProvider, type ChatClientProviderProps } from './providers/chat-client-provider.js';
export { ChatRoomProvider, type ChatRoomProviderProps } from './providers/chat-room-provider.js';
export { type ChatStatusResponse } from './types/chat-status-response.js';
export { type StatusParams } from './types/status-params.js';
