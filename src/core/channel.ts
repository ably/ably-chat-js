/**
 * Gets the single main channel for the chat room.
 * @param roomName The room name.
 * @returns  The channel name.
 */
export const roomChannelName = (roomName: string): string => `${roomName}::$chat`;
