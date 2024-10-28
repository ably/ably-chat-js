import * as Ably from 'ably';
import { vi } from 'vitest';

import { ChatClient } from '../../src/core/chat.ts';
import { ChatApi } from '../../src/core/chat-api.ts';
import { ErrorCodes } from '../../src/core/errors.ts';
import { DefaultRoom, Room } from '../../src/core/room.ts';
import { RoomOptions, RoomOptionsDefaults } from '../../src/core/room-options.ts';
import { RoomLifecycle, RoomStatus } from '../../src/core/room-status.ts';
import { randomRoomId } from './identifier.ts';
import { makeTestLogger } from './logger.ts';
import { ablyRealtimeClient } from './realtime-client.ts';

// Wait 3 seconds for the room to reach the expected status
export const waitForRoomStatus = async (room: Room, expected: RoomStatus) => {
  return vi.waitUntil(() => room.status === expected, 3000);
};

export const waitForRoomLifecycleStatus = async (lifecycle: RoomLifecycle, expected: RoomStatus) => {
  return vi.waitUntil(() => lifecycle.status === expected, 3000);
};

// Wait 3 seconds for the room error to reach an expected code
export const waitForRoomError = async (status: RoomLifecycle, expected: ErrorCodes) => {
  return vi.waitUntil(() => status.error?.code === expected, 3000);
};

// Gets a random room with default options from the chat client
export const getRandomRoom = (chat: ChatClient): Room => chat.rooms.get(randomRoomId(), defaultRoomOptions);

// Return a default set of room options
export const defaultRoomOptions: RoomOptions = {
  ...RoomOptionsDefaults,
};

// Makes a room with the given (or default) options, as a standalone room aside from the chat client
// Should be used in unit tests where the dependencies are mocked.
export const makeRandomRoom = (params: {
  realtime?: Ably.Realtime;
  chatApi?: ChatApi;
  options?: RoomOptions;
}): Room => {
  const logger = makeTestLogger();
  const realtime = params.realtime ?? ablyRealtimeClient();
  const chatApi = params.chatApi ?? new ChatApi(realtime, logger);

  return new DefaultRoom(
    randomRoomId(),
    params.options ?? defaultRoomOptions,
    realtime,
    chatApi,
    logger,
    Promise.resolve(),
  );
};
