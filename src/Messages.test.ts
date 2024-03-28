import { beforeEach, describe, vi, it, expect } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Room } from './Room.js';
import { MessageEvents } from './events.js';

interface TestContext {
  realtime: Realtime;
  chatApi: ChatApi;
  emulateBackendPublish: Types.messageCallback<Partial<Types.Message>>;
}

vi.mock('ably/promises');

describe('Messages', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi(context.realtime);

    const channel = context.realtime.channels.get('roomId');
    const listeners: Types.messageCallback<Types.Message>[] = [];
    vi.spyOn(channel, 'subscribe').mockImplementation(
      // @ts-ignore
      async (
        nameOrListener: string | Types.messageCallback<Types.Message>,
        listener: Types.messageCallback<Types.Message>,
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
    it<TestContext>('should return message if chat backend request come before realtime', async (context) => {
      const { chatApi, realtime } = context;
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({ id: 'messageId' });

      const room = new Room('roomId', realtime, chatApi);
      const messagePromise = room.messages.send('text');

      context.emulateBackendPublish({
        clientId: 'clientId',
        name: 'message.created',
        data: {
          id: 'messageId',
          content: 'text',
          created_by: 'clientId',
        },
      });

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          id: 'messageId',
          content: 'text',
          created_by: 'clientId',
        }),
      );
    });

    it<TestContext>('should return message if chat backend request come after realtime', async (context) => {
      const { chatApi, realtime } = context;

      vi.spyOn(chatApi, 'sendMessage').mockImplementation(async (roomId, text) => {
        context.emulateBackendPublish({
          clientId: 'clientId',
          data: {
            id: 'messageId',
            content: text,
            created_by: 'clientId',
          },
        });
        return { id: 'messageId' };
      });

      const room = new Room('roomId', realtime, chatApi);
      const message = await room.messages.send('text');

      expect(message).toEqual(
        expect.objectContaining({
          id: 'messageId',
          content: 'text',
          created_by: 'clientId',
        }),
      );
    });
  });

  describe('editing message', () => {
    it<TestContext>('should return message if chat backend request come before realtime', async (context) => {
      const { chatApi, realtime } = context;
      vi.spyOn(chatApi, 'editMessage').mockResolvedValue({ id: 'messageId' });

      const room = new Room('roomId', realtime, chatApi);
      const messagePromise = room.messages.edit('messageId', 'new_text');

      context.emulateBackendPublish({
        clientId: 'clientId',
        data: {
          id: 'messageId',
          content: 'new_text',
        },
      });

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          id: 'messageId',
          content: 'new_text',
        }),
      );
    });

    it<TestContext>('should return message if chat backend request come after realtime', async (context) => {
      const { chatApi, realtime } = context;

      vi.spyOn(chatApi, 'editMessage').mockImplementation(async (roomId, messageId, text) => {
        context.emulateBackendPublish({
          clientId: 'clientId',
          data: {
            id: messageId,
            content: text,
            created_by: 'clientId',
          },
        });
        return { id: 'messageId' };
      });

      const room = new Room('roomId', realtime, chatApi);
      const message = await room.messages.edit('messageId', 'new_text');

      expect(message).toEqual(
        expect.objectContaining({
          id: 'messageId',
          content: 'new_text',
          created_by: 'clientId',
        }),
      );
    });
  });

  describe('deleting message', () => {
    it<TestContext>('should delete message by message object', async (context) => {
      const { chatApi, realtime } = context;

      vi.spyOn(chatApi, 'deleteMessage').mockImplementation(async (roomId, messageId) => {
        context.emulateBackendPublish({
          clientId: 'clientId',
          data: {
            id: messageId,
            created_by: 'clientId',
            content: 'text',
            deleted_at: 1111,
          },
        });
      });

      const room = new Room('roomId', realtime, chatApi);
      const message = await room.messages.delete({ id: 'messageId', content: 'text' } as any);

      expect(message).toEqual(
        expect.objectContaining({
          id: 'messageId',
          created_by: 'clientId',
          content: 'text',
          deleted_at: 1111,
        }),
      );
    });

    it<TestContext>('should delete message by messageId', async (context) => {
      const { chatApi, realtime } = context;
      vi.spyOn(chatApi, 'deleteMessage').mockResolvedValue(undefined);

      const room = new Room('roomId', realtime, chatApi);
      const messagePromise = room.messages.delete('messageId');

      context.emulateBackendPublish({
        clientId: 'clientId',
        data: {
          id: 'messageId',
          created_by: 'clientId',
          content: 'text',
          deleted_at: 1111,
        },
      });

      const message = await messagePromise;

      expect(message).toEqual(
        expect.objectContaining({
          id: 'messageId',
          created_by: 'clientId',
          content: 'text',
          deleted_at: 1111,
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

    it<TestContext>('should enrich edited message even if it is not in cache', (context) =>
      new Promise<void>((done) => {
        const { chatApi, realtime } = context;
        vi.spyOn(chatApi, 'getMessages').mockResolvedValue([]);
        vi.spyOn(chatApi, 'getMessage').mockResolvedValue({
          id: '01HNBQ3QF6RPYNMYE6P226BMD1',
          room_id: 'roomId',
          content: 'old_text',
          created_by: 'clientId',
        } as any);

        const room = new Room('roomId', realtime, chatApi);
        room.messages.subscribe(MessageEvents.edited, ({ message }) => {
          expect(message).toEqual(
            expect.objectContaining({
              id: '01HNBQ3QF6RPYNMYE6P226BMD1',
              content: 'text',
              created_by: 'clientId',
            }),
          );
          done();
        });
        context.emulateBackendPublish({
          clientId: 'clientId',
          name: 'message.edited',
          data: {
            id: '01HNBQ3QF6RPYNMYE6P226BMD1',
            content: 'text',
          },
        });
      }));
  });

  describe('adding message reaction', () => {
    it<TestContext>('should return reaction if chat backend request come before realtime', async (context) => {
      const { chatApi, realtime } = context;
      vi.spyOn(chatApi, 'addMessageReaction').mockResolvedValue({ id: 'reactionId' });

      const room = new Room('roomId', realtime, chatApi);
      const reactionPromise = room.messages.addReaction('messageId', 'like');

      context.emulateBackendPublish({
        clientId: 'clientId',
        data: {
          id: 'reactionId',
          message_id: 'messageId',
          type: 'like',
          created_by: 'clientId',
        },
      });

      const reaction = await reactionPromise;

      expect(reaction).toEqual(
        expect.objectContaining({
          id: 'reactionId',
          message_id: 'messageId',
          type: 'like',
          created_by: 'clientId',
        }),
      );
    });

    it<TestContext>('should return reaction if chat backend request come after realtime', async (context) => {
      const { chatApi, realtime } = context;

      vi.spyOn(chatApi, 'addMessageReaction').mockImplementation(async (roomId, messageId, type) => {
        context.emulateBackendPublish({
          clientId: 'clientId',
          data: {
            id: 'reactionId',
            message_id: messageId,
            type,
            created_by: 'clientId',
          },
        });
        return { id: 'reactionId' };
      });

      const room = new Room('roomId', realtime, chatApi);
      const reaction = await room.messages.addReaction('messageId', 'like');

      expect(reaction).toEqual(
        expect.objectContaining({
          id: 'reactionId',
          message_id: 'messageId',
          type: 'like',
          created_by: 'clientId',
        }),
      );
    });
  });

  describe('deleting message reaction', () => {
    it<TestContext>('should return reaction if chat backend request come before realtime', async (context) => {
      const { chatApi, realtime } = context;
      vi.spyOn(chatApi, 'deleteMessageReaction').mockResolvedValue(undefined);

      const room = new Room('roomId', realtime, chatApi);
      const reactionPromise = room.messages.removeReaction('messageId', 'reactionId');

      context.emulateBackendPublish({
        clientId: 'clientId',
        data: {
          id: 'reactionId',
          message_id: 'messageId',
          type: 'like',
          created_by: 'clientId',
        },
      });

      const reaction = await reactionPromise;

      expect(reaction).toEqual(
        expect.objectContaining({
          id: 'reactionId',
          message_id: 'messageId',
          type: 'like',
          created_by: 'clientId',
        }),
      );
    });

    it<TestContext>('should return reaction if chat backend request come after realtime', async (context) => {
      const { chatApi, realtime } = context;

      vi.spyOn(chatApi, 'deleteMessageReaction').mockImplementation(async (roomId, messageId, reactionId) => {
        context.emulateBackendPublish({
          clientId: 'clientId',
          data: {
            id: reactionId,
            message_id: 'messageId',
            type: 'like',
            created_by: 'clientId',
          },
        });
      });

      const room = new Room('roomId', realtime, chatApi);
      const reaction = await room.messages.removeReaction('messageId', 'reactionId');

      expect(reaction).toEqual(
        expect.objectContaining({
          id: 'reactionId',
          message_id: 'messageId',
          type: 'like',
          created_by: 'clientId',
        }),
      );
    });
  });
});
