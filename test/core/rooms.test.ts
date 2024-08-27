import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { DefaultRoom, Room } from '../../src/core/room.ts';
import { RoomLifecycleManager } from '../../src/core/room-lifecycle-manager.ts';
import { RoomOptions, RoomOptionsDefaults } from '../../src/core/room-options.ts';
import { DefaultTyping } from '../../src/core/typing.ts';
import { randomRoomId } from '../helper/identifier.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { ablyRealtimeClient } from '../helper/realtime-client.ts';
import { defaultRoomOptions } from '../helper/room.ts';
import { RoomLifecycle } from '@ably/chat';
import { DefaultRooms, Rooms } from '../../src/core/rooms.ts';
import { normalizeClientOptions } from '../../src/core/config.ts';

vi.mock('ably');

interface TestContext {
  realtime: Ably.Realtime;
  rooms: Rooms,
}

describe('Room', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = ablyRealtimeClient();
    const logger = makeTestLogger();
    const chatApi = new ChatApi(context.realtime, logger);
    context.rooms = new DefaultRooms(context.realtime, normalizeClientOptions({}), logger);
  });

  describe('room get-release lifecycle', () => {
    // todo

    it<TestContext>('should return a the same room if rooms.get called twice', async (context) => {
    });
    it<TestContext>('should return a fresh room in room.get if previous one is currently releasing', async (context) => {
    });
    it<TestContext>('should correctly forward releasing promises to new room instances', async (context) => {
    });
  });

});
