import { beforeEach, describe, vi, it, expect } from 'vitest';
import { Realtime, Types } from 'ably/promises';
import { ChatApi } from './ChatApi.js';
import { Conversation } from './Conversation.js';

interface TestContext {
  realtime: Realtime;
  chatApi: ChatApi;
  emulateBackendPublish: Types.messageCallback<Partial<Types.Message>>;
}

vi.mock('ably/promises');

describe('Messages', () => {
  beforeEach<TestContext>((context) => {
    context.realtime = new Realtime({ clientId: 'clientId', key: 'key' });
    context.chatApi = new ChatApi('clientId');

    const channel = context.realtime.channels.get('conversationId');
    vi.spyOn(channel, 'subscribe').mockImplementation(
      // @ts-ignore
      async (name: string, listener: Types.messageCallback<Types.Message>) => {
        context.emulateBackendPublish = listener;
      },
    );
  });

  describe('sending message', () => {
    it<TestContext>('should return message if chat backend request come before realtime', async (context) => {
      const { chatApi, realtime } = context;
      vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({ id: 'messageId' });

      const conversation = new Conversation('conversationId', realtime, chatApi);
      const messagePromise = conversation.messages.send('text');

      context.emulateBackendPublish({
        clientId: 'clientId',
        data: {
          id: 'messageId',
          content: 'text',
          client_id: 'clientId',
        },
      });

      const message = await messagePromise;

      expect(message).toContain({
        id: 'messageId',
        content: 'text',
        client_id: 'clientId',
      });
    });

    it<TestContext>('should return message if chat backend request come after realtime', async (context) => {
      const { chatApi, realtime } = context;

      vi.spyOn(chatApi, 'sendMessage').mockImplementation(async (conversationId, text) => {
        context.emulateBackendPublish({
          clientId: 'clientId',
          data: {
            id: 'messageId',
            content: text,
            client_id: 'clientId',
          },
        });
        return { id: 'messageId' };
      });

      const conversation = new Conversation('conversationId', realtime, chatApi);
      const message = await conversation.messages.send('text');

      expect(message).toContain({
        id: 'messageId',
        content: 'text',
        client_id: 'clientId',
      });
    });
  });

  describe('editing message', () => {
    it<TestContext>('should return message if chat backend request come before realtime', async (context) => {
      const { chatApi, realtime } = context;
      vi.spyOn(chatApi, 'editMessage').mockResolvedValue({ id: 'messageId' });

      const conversation = new Conversation('conversationId', realtime, chatApi);
      const messagePromise = conversation.messages.edit('messageId', 'new_text');

      context.emulateBackendPublish({
        clientId: 'clientId',
        data: {
          id: 'messageId',
          content: 'new_text',
          client_id: 'clientId',
        },
      });

      const message = await messagePromise;

      expect(message).toContain({
        id: 'messageId',
        content: 'new_text',
        client_id: 'clientId',
      });
    });

    it<TestContext>('should return message if chat backend request come after realtime', async (context) => {
      const { chatApi, realtime } = context;

      vi.spyOn(chatApi, 'editMessage').mockImplementation(async (conversationId, messageId, text) => {
        context.emulateBackendPublish({
          clientId: 'clientId',
          data: {
            id: messageId,
            content: text,
            client_id: 'clientId',
          },
        });
        return { id: 'messageId' };
      });

      const conversation = new Conversation('conversationId', realtime, chatApi);
      const message = await conversation.messages.edit('messageId', 'new_text');

      expect(message).toContain({
        id: 'messageId',
        content: 'new_text',
        client_id: 'clientId',
      });
    });
  });

  describe('deleting message', () => {
    it<TestContext>('should delete message by message object', async (context) => {
      const { chatApi, realtime } = context;

      vi.spyOn(chatApi, 'deleteMessage').mockImplementation(async (conversationId, messageId) => {
        context.emulateBackendPublish({
          clientId: 'clientId',
          data: {
            id: messageId,
            client_id: 'clientId',
            content: 'text',
            deleted_at: 1111,
          },
        });
      });

      const conversation = new Conversation('conversationId', realtime, chatApi);
      const message = await conversation.messages.delete({ id: 'messageId', content: 'text' } as any);

      expect(message).toContain({
        id: 'messageId',
        client_id: 'clientId',
        content: 'text',
        deleted_at: 1111,
      });
    });

    it<TestContext>('should delete message by messageId', async (context) => {
      const { chatApi, realtime } = context;
      vi.spyOn(chatApi, 'deleteMessage').mockResolvedValue(undefined);

      const conversation = new Conversation('conversationId', realtime, chatApi);
      const messagePromise = conversation.messages.delete('messageId');

      context.emulateBackendPublish({
        clientId: 'clientId',
        data: {
          id: 'messageId',
          client_id: 'clientId',
          content: 'text',
          deleted_at: 1111,
        },
      });

      const message = await messagePromise;

      expect(message).toContain({
        id: 'messageId',
        client_id: 'clientId',
        content: 'text',
        deleted_at: 1111,
      });
    });
  });
});
