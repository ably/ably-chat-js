import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../src/ChatApi.js';
import { DefaultPresence } from '../src/Presence.js';
import { Room } from '../src/Room.js';
import { makeTestLogger } from './helper/logger.js';
import { makeRandomRoom } from './helper/room.js';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  room: Room;
  currentChannelOptions: Ably.ChannelOptions;
}

vi.mock('ably');

describe('Presence', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());
    context.room = makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime });
  });

  it<TestContext>('has an attachment error code', (context) => {
    expect((context.room.presence as DefaultPresence).attachmentErrorCode).toBe(102002);
  });

  it<TestContext>('has a detachment error code', (context) => {
    expect((context.room.presence as DefaultPresence).detachmentErrorCode).toBe(102051);
  });
});
