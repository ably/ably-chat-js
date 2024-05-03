import { beforeEach, describe, vi, it, expect } from 'vitest';
import * as Ably from 'ably';
import { ChatApi } from './ChatApi.js';
import { Room } from './Room.js';
import { MessageEvents } from './events.js';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  emulateBackendPublish: Ably.messageCallback<Partial<Ably.Message>>;
}

vi.mock('ably');

describe('Messages', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Ably.Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime);

    const channel = context.realtime.channels.get('roomId');
    const listeners: Ably.messageCallback<Ably.Message>[] = [];
    vi.spyOn(channel, 'subscribe').mockImplementation(
      // @ts-ignore
      async (
        nameOrListener: string | Ably.messageCallback<Ably.Message>,
        listener: Ably.messageCallback<Ably.Message>,
      ) => {
        if (typeof nameOrListener === 'string') {
          listeners.push(listener);
        } else {
          listeners.push(nameOrListener);
        }
        // @ts-ignore
        context.emulateBackendPublish = (msg) => listeners.forEach((listener) => listener(msg));
      },
    );
  });

  describe('sending message', () => {
    it<TestContext>('should be able to send message and get it back from response', async (context) => {
      const { chatApi, realtime } = context;
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({ id: 'messageId' });

      const room = new Room('roomId', realtime, chatApi);
      const messagePromise = room.messages.send('text');

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          id: 'messageId',
          content: 'text',
          created_by: 'clientId',
        }),
      );
    });
  });

  describe('subscribing to updates', () => {
    it<TestContext>('should not miss events that came before last messages has been fetched and emit them after', (context) =>
      new Promise<void>((done) => {
        const { chatApi, realtime } = context;
        vi.spyOn(chatApi, 'getMessages').mockResolvedValue([
          {
            id: '01HNBQ3QF6RPYNMYE6P226BMD1',
            room_id: 'roomId',
            content: 'foo',
          } as any,
        ]);

        const room = new Room('roomId', realtime, chatApi);
        room.messages.subscribe(MessageEvents.created, ({ message }) => {
          expect(message).toEqual(
            expect.objectContaining({
              id: 'messageId',
              content: 'text',
              created_by: 'clientId',
            }),
          );
          done();
        });
        context.emulateBackendPublish({
          clientId: 'clientId',
          name: 'message.created',
          data: {
            id: 'messageId',
            content: 'text',
            created_by: 'clientId',
          },
        });
      }));
  });

});
