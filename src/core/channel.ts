/**
 * Get the channel name for the chat messages channel.
 * @param roomId The room ID.
 * @returns The channel name.
 */
export const messagesChannelName = (roomId: string): string => `${roomId}::$chat::$chatMessages`;
