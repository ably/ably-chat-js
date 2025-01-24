import * as Ably from 'ably';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatApi } from '../src/chat-api.ts';
import { DefaultPresence } from '../srce.ts';
import { Room } from '../src';
import { makeTestLogger } from '../../../test/helper/logger.ts';
import { makeRandomRoom } from '../../../test/helper/room.ts';

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

  it<TestContext>('throws ErrorInfo if subscribing with no arguments', (context) => {
    expect(() => {
      context.room.presence.subscribe();
    }).toThrowErrorInfo({
      message: 'could not subscribe listener: invalid arguments',
      code: 40000,
    });
  });
});
