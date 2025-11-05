// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as Ably from 'ably';
import { useCallback } from 'react';

import { ConnectionStatusChange } from '../../core/connection.js';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Room } from '../../core/room.js';
import { RoomStatusChange } from '../../core/room-status.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { useRoomLogger } from './internal/use-logger.js';
import { useRoomContext } from './internal/use-room-context.js';
import { useRoomStatus } from './internal/use-room-status.js';
import { useChatConnection } from './use-chat-connection.js';

/**
 * The parameters for the {@link useRoom} hook.
 */
export interface UseRoomParams {
  /**
   * Callback for when the room status changes. The listener is removed when
   * the component unmounts.
   * @param change The change object.
   * @example
   * ```tsx
   * useRoom({
   *   onStatusChange: (change) => {
   *     console.log(`Room status changed from ${change.previous} to ${change.current}`);
   *   },
   * });
   *```
   */
  onStatusChange?: (change: RoomStatusChange) => void;

  /**
   * Callback for when the connection status changes. The listener is removed
   * when the component unmounts.
   * @param change The change object.
   * @example
   * ```tsx
   * useRoom({
   *   onConnectionStatusChange: (change) => {
   *     console.log(`Connection changed from ${change.previous} to ${change.current}`);
   *   },
   * });
   * ```
   */
  onConnectionStatusChange?: (change: ConnectionStatusChange) => void;
}

/**
 * The return type for the {@link useRoom} hook.
 */
export interface UseRoomResponse extends ChatStatusResponse {
  /**
   * The unique identifier of the room.
   */
  readonly roomName: string;

  /**
   * Shortcut to {@link Room.attach}. The {@link ChatRoomProvider} will handle attaching and detaching
   * automatically, so this is only needed for manual control.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @example
   * ```tsx
   * const { attach, roomStatus } = useRoom();
   *
   * const handleManualAttach = async () => {
   *   try {
   *     await attach();
   *     console.log('Room attached successfully');
   *   } catch (error) {
   *     console.error('Failed to attach room:', error);
   *   }
   * };
   * ```
   */
  attach: () => Promise<void>;

  /**
   * Shortcut to {@link Room.detach}. The {@link ChatRoomProvider} will handle attaching and detaching
   * automatically, so this is only needed for manual control.
   *
   * This is a stable reference and will not be changed between renders for the same room.
   * @example
   * ```tsx
   * const { detach, roomStatus } = useRoom();
   *
   * const handleManualDetach = async () => {
   *   try {
   *     await detach();
   *     console.log('Room detached successfully');
   *   } catch (error) {
   *     console.error('Failed to detach room:', error);
   *   }
   * };
   * ```
   */
  detach: () => Promise<void>;
}

/**
 * React hook that provides access to room information and basic room operations.
 *
 * Typically, you won't need to call `attach()` or `detach()` manually since the
 * {@link ChatRoomProvider} handles room lifecycle automatically.
 *
 * **Note**: This hook must be used within a {@link ChatRoomProvider} component tree.
 * @param params - Optional parameters for status change callbacks
 * @returns A {@link UseRoomResponse} containing room data and operations
 * @throws An {@link Ably.ErrorInfo} with {@link chat-js!ErrorCode.ReactHookMustBeUsedWithinProvider | ReactHookMustBeUsedWithinProvider} When used outside of a {@link ChatRoomProvider}
 * @example Basic usage
 * ```tsx
 * import React from 'react';
 * import { ChatClient } from '@ably/chat';
 * import {
 *   ChatClientProvider,
 *   ChatRoomProvider,
 *   useRoom
 * } from '@ably/chat/react';
 *
 * // Component that displays room information
 * const RoomInfo = () => {
 *   const { roomName, roomStatus, connectionStatus } = useRoom({
 *     onStatusChange: (change) => {
 *       console.log(`Room status changed from ${change.previous} to ${change.current}`);
 *     },
 *     onConnectionStatusChange: (change) => {
 *       console.log(`Connection changed from ${change.previous} to ${change.current}`);
 *     }
 *   });
 *
 *   return (
 *     <div>
 *       <div>Room: {roomName}</div>
 *       <div>Status: {roomStatus}</div>
 *       <div>Connection: {connectionStatus}</div>
 *     </div>
 *   );
 * };
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * // App component with providers
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <ChatRoomProvider name="general-chat">
 *         <RoomInfo />
 *       </ChatRoomProvider>
 *     </ChatClientProvider>
 *   );
 * };
 *
 * export default App;
 * ```
 */
export const useRoom = (params?: UseRoomParams): UseRoomResponse => {
  const context = useRoomContext('useRoom');
  const roomName = context.roomName;
  const logger = useRoomLogger();
  logger.debug('useRoom();');

  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  // room error and status callbacks
  const roomStatus = useRoomStatus({
    onRoomStatusChange: params?.onStatusChange,
  });

  const attach = useCallback(async () => {
    const room = await context.room;
    return room.attach();
  }, [context]);
  const detach = useCallback(async () => {
    const room = await context.room;
    return room.detach();
  }, [context]);

  return {
    roomName: roomName,
    attach: attach,
    detach: detach,
    roomStatus: roomStatus.status,
    roomError: roomStatus.error,
    connectionStatus: connectionStatus,
    connectionError: connectionError,
  };
};
