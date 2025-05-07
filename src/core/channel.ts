/**
 * Gets the single main channel for the chat room.
 *
 * @param roomId The room ID.
 * @returns  The channel name.
 */
export const roomChannelName = (roomId: string): string => `${roomId}::$chat`;
