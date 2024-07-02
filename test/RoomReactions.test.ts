import * as Ably from 'ably';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatApi } from '../src/ChatApi.js';
import { Reaction } from '../src/Reaction.js';
import { Room } from '../src/Room.js';
import { channelEventEmitter } from './helper/channel.js';
import { makeTestLogger } from './helper/logger.js';
import { makeRandomRoom } from './helper/room.js';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  publishTimestamp: Date;
  room: Room;
  setPublishTimestamp: (d: Date) => void;
  emulateBackendPublish: Ably.messageCallback<Partial<Ably.Message>>;
}

vi.mock('ably');

describe('Reactions', () => {
  beforeEach<TestContext>((context) => {
    const clientId = 'd.vader';

    context.realtime = new Ably.Realtime({ clientId: clientId, key: 'key' });
    context.chatApi = new ChatApi(context.realtime, makeTestLogger());

    context.publishTimestamp = new Date();
    context.setPublishTimestamp = (date: Date) => {
      context.publishTimestamp = date;
    };

    context.room = makeRandomRoom({ chatApi: context.chatApi, realtime: context.realtime });
    context.emulateBackendPublish = channelEventEmitter(context.room.reactions.channel);

    vi.spyOn(context.room.reactions.channel, 'publish').mockImplementation((message: Ably.Message) => {
      context.emulateBackendPublish({
        ...message,
        clientId: clientId,
        timestamp: context.publishTimestamp.getTime(),
        encoding: 'json',
      });
      return Promise.resolve();
    });
  });

  describe('receiving a reaction', () => {
    it<TestContext>("should be able to get a reaction from realtime channel and recognize it as being somebody else's", (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = new Date().getTime();
        const { room } = context;

        room.reactions.subscribe((reaction) => {
          try {
            expect(reaction).toEqual(
              expect.objectContaining({
                clientId: 'yoda',
                isSelf: false,
                createdAt: new Date(publishTimestamp),
                type: 'like',
              }),
            );
          } catch (err: unknown) {
            reject(err as Error);
          }
          done();
        });

        context.emulateBackendPublish({
          clientId: 'yoda',
          name: 'roomReaction',
          data: {
            type: 'like',
          },
          timestamp: publishTimestamp,
        });
      }));

    it<TestContext>('should be able to get a reaction from realtime channel and recognise it as your own', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = new Date().getTime();
        const { room } = context;

        room.reactions.subscribe((reaction) => {
          try {
            expect(reaction).toEqual(
              expect.objectContaining({
                clientId: 'd.vader',
                isSelf: true,
                createdAt: new Date(publishTimestamp),
                type: 'hate',
              }),
            );
          } catch (err: unknown) {
            reject(err as Error);
          }
          done();
        });

        context.emulateBackendPublish({
          clientId: 'd.vader',
          name: 'roomReaction',
          data: {
            type: 'hate',
          },
          timestamp: publishTimestamp,
        });
      }));
  });

  it<TestContext>('should be able to unsubscribe from reactions', (context) => {
    const publishTimestamp = new Date().getTime();
    const { room } = context;

    const receivedReactions: Reaction[] = [];
    const { unsubscribe } = room.reactions.subscribe((reaction) => {
      receivedReactions.push(reaction);
    });

    // Publish the first reaction
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'roomReaction',
      data: {
        type: 'like',
      },
      timestamp: publishTimestamp,
    });

    // Unsubscribe
    unsubscribe();

    // Publish the second reaction
    context.emulateBackendPublish({
      clientId: 'yoda2',
      name: 'roomReaction',
      data: {
        type: 'like',
      },
      timestamp: publishTimestamp,
    });

    // Check that we only received the first reaction
    expect(receivedReactions).toHaveLength(1);
    expect(receivedReactions[0]).toEqual(
      expect.objectContaining({
        clientId: 'yoda',
        isSelf: false,
        createdAt: new Date(publishTimestamp),
        type: 'like',
      }),
    );
  });

  it<TestContext>('should be able to unsubscribe all reactions', (context) => {
    const publishTimestamp = new Date().getTime();
    const { room } = context;

    const receivedReactions: Reaction[] = [];
    room.reactions.subscribe((reaction) => {
      receivedReactions.push(reaction);
    });

    const receivedReactions2: Reaction[] = [];
    room.reactions.subscribe((reaction) => {
      receivedReactions2.push(reaction);
    });

    // Publish the first reaction
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'roomReaction',
      data: {
        type: 'like',
      },
      timestamp: publishTimestamp,
    });

    // Unsubscribe
    room.reactions.unsubscribeAll();

    // Publish the second reaction
    context.emulateBackendPublish({
      clientId: 'yoda2',
      name: 'roomReaction',
      data: {
        type: 'like',
      },
      timestamp: publishTimestamp,
    });

    // Check that we only received the first reaction
    expect(receivedReactions).toHaveLength(1);
    expect(receivedReactions[0]).toEqual(
      expect.objectContaining({
        clientId: 'yoda',
        isSelf: false,
        createdAt: new Date(publishTimestamp),
        type: 'like',
      }),
    );

    // Check that we only received the first reaction
    expect(receivedReactions2).toHaveLength(1);
    expect(receivedReactions2[0]).toEqual(
      expect.objectContaining({
        clientId: 'yoda',
        isSelf: false,
        createdAt: new Date(publishTimestamp),
        type: 'like',
      }),
    );
  });

  describe.each([
    ['empty client id', { clientId: '', name: 'roomReaction', data: { type: 'like' }, timestamp: 123 }],
    ['no client id', { name: 'roomReaction', data: { type: 'like' }, timestamp: 123 }],
    ['empty type', { clientId: 'abc', name: 'roomReaction', data: { type: '' }, timestamp: 123 }],
    ['no type', { clientId: 'abc', name: 'roomReaction', data: {}, timestamp: 123 }],
    ['no data', { clientId: 'abc', name: 'roomReaction', timestamp: 123 }],
  ])('invalid incoming reactions: %s', (description: string, inbound: object) => {
    test<TestContext>(
      'does not process invalid incoming reaction: ' + description,
      (context) =>
        new Promise<void>((done, reject) => {
          const { room } = context;

          room.reactions.subscribe(() => {
            reject(new Error('Should not have received a reaction'));
          });

          context.emulateBackendPublish(inbound);
          done();
        }),
    );
  });

  describe('sending a reaction', () => {
    it<TestContext>('should be able to send a reaction and see it back on the realtime channel', (context) =>
      new Promise<void>((done, reject) => {
        const { room } = context;

        room.reactions.subscribe((reaction) => {
          try {
            expect(reaction).toEqual(
              expect.objectContaining({
                clientId: 'd.vader',
                isSelf: true,
                createdAt: context.publishTimestamp,
                type: 'love',
              }),
            );
          } catch (err: unknown) {
            reject(err as Error);
          }
          done();
        });

        void room.reactions.send({ type: 'love' });
      }));

    it<TestContext>('should be able to send a reaction and receive a reaction with metadata and headers', (context) =>
      new Promise<void>((done, reject) => {
        const { room } = context;

        room.reactions.subscribe((reaction) => {
          try {
            expect(reaction).toEqual(
              expect.objectContaining({
                clientId: 'd.vader',
                isSelf: true,
                createdAt: context.publishTimestamp,
                type: 'love',
                headers: {
                  action: 'strike back',
                  number: 1980,
                },
                metadata: {
                  side: 'empire',
                  bla: {
                    abc: true,
                    xyz: 3.14,
                  },
                },
              } as Reaction),
            );
          } catch (err: unknown) {
            reject(err as Error);
          }
          done();
        });

        void room.reactions.send({
          type: 'love',
          metadata: { side: 'empire', bla: { abc: true, xyz: 3.14 } },
          headers: { action: 'strike back', number: 1980 },
        });
      }));

    it<TestContext>('should not be able to use reserved prefix in reaction headers', (context) =>
      new Promise<void>((done, reject) => {
        const { room } = context;

        room.reactions.subscribe(() => {
          reject(new Error("should not receive reaction, sending must've failed"));
        });

        const sendPromise = room.reactions.send({
          type: 'love',
          headers: { 'ably-chat-hello': true }, // "ably-chat" prefix is the reserved
        });

        sendPromise
          .then(() => {
            reject(new Error('send should not succeed'));
          })
          .catch((err: unknown) => {
            const errInfo = err as Ably.ErrorInfo;
            expect(errInfo).toBeTruthy();
            expect(errInfo.message).toMatch(/reserved prefix/);
            expect(errInfo.code).toEqual(40001);
            done();
          });
      }));

    it<TestContext>('should not be able to use reserved key in reaction metadata', (context) =>
      new Promise<void>((done, reject) => {
        const { room } = context;

        room.reactions.subscribe(() => {
          reject(new Error("should not receive reaction, sending must've failed"));
        });

        const sendPromise = room.reactions.send({
          type: 'love',
          metadata: { 'ably-chat': { value: 1 } }, // "ably-chat" is reserved
        });

        sendPromise
          .then(() => {
            reject(new Error('send should not succeed'));
          })
          .catch((err: unknown) => {
            const errInfo = err as Ably.ErrorInfo;
            expect(errInfo).toBeTruthy();
            expect(errInfo.message).toMatch(/reserved key/);
            expect(errInfo.code).toEqual(40001);
            done();
          });
      }));
  });
});
