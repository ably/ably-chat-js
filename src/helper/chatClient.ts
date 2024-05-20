import * as Ably from 'ably';
import { Chat } from '../Chat.ts';

// Create a chat client with the given options
// and return it.
const ablyChatClient = (realtime: Ably.Realtime): Chat => {
  return new Chat(realtime);
};

export { ablyChatClient };
