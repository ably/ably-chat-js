import * as Ably from 'ably';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { RoomReactionEventType } from '../../src/core/events.ts';
import { Reaction } from '../../src/core/reaction.ts';
import { Room } from '../../src/core/room.ts';
import { channelEventEmitter } from '../helper/channel.ts';
import { makeTestLogger } from '../helper/logger.ts';
import { makeRandomRoom } from '../helper/room.ts';

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
    const channel = context.room.channel;
    context.emulateBackendPublish = channelEventEmitter(channel);

    vi.spyOn(channel, 'publish').mockImplementation((message: Ably.Message) => {
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
        const publishTimestamp = Date.now();
        const { room } = context;

        room.reactions.subscribe((event) => {
          try {
            expect(event.type).toBe(RoomReactionEventType.Reaction);
            expect(event.reaction).toEqual(
              expect.objectContaining({
                clientId: 'yoda',
                isSelf: false,
                createdAt: new Date(publishTimestamp),
                type: 'like',
              }),
            );
          } catch (error: unknown) {
            reject(error as Error);
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

    it<TestContext>('should be able to get a reaction from realtime channel and recognize it as your own', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = Date.now();
        const { room } = context;

        room.reactions.subscribe((event) => {
          try {
            expect(event.type).toBe(RoomReactionEventType.Reaction);
            expect(event.reaction).toEqual(
              expect.objectContaining({
                clientId: 'd.vader',
                isSelf: true,
                createdAt: new Date(publishTimestamp),
                type: 'hate',
              }),
            );
          } catch (error: unknown) {
            reject(error as Error);
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
    const publishTimestamp = Date.now();
    const { room } = context;

    const receivedReactions: Reaction[] = [];
    const { unsubscribe } = room.reactions.subscribe((event) => {
      receivedReactions.push(event.reaction);
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

  it<TestContext>('should only unsubscribe the correct subscription', (context) => {
    const publishTimestamp = Date.now();
    const { room } = context;

    const received: string[] = [];
    const listener = (event: { reaction: Reaction }) => {
      received.push(event.reaction.type);
    };
    const subscription1 = room.reactions.subscribe(listener);
    const subscription2 = room.reactions.subscribe(listener);

    // Publish first reaction
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'roomReaction',
      data: {
        type: 'like',
      },
      timestamp: publishTimestamp,
    });
    expect(received).toEqual(['like', 'like']);

    subscription1.unsubscribe();

    // Publish second reaction
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'roomReaction',
      data: {
        type: 'love',
      },
      timestamp: publishTimestamp,
    });
    expect(received).toEqual(['like', 'like', 'love']);

    subscription2.unsubscribe();

    // Publish third reaction
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'roomReaction',
      data: {
        type: 'hug',
      },
      timestamp: publishTimestamp,
    });
    expect(received).toEqual(['like', 'like', 'love']);
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

        // Add spy to check the published message
        const publishSpy = vi.spyOn(room.channel, 'publish');

        room.reactions.subscribe((reaction) => {
          try {
            expect(reaction).toEqual(
              expect.objectContaining({
                type: RoomReactionEventType.Reaction,
                reaction: {
                  clientId: 'd.vader',
                  isSelf: true,
                  createdAt: context.publishTimestamp,
                  type: 'love',
                  headers: {},
                  metadata: {},
                },
              }),
            );

            // Verify the complete published message structure
            expect(publishSpy).toHaveBeenCalledWith({
              name: 'roomReaction',
              data: {
                type: 'love',
                metadata: {},
              },
              extras: {
                ephemeral: true,
                headers: {},
              },
            });
          } catch (error: unknown) {
            reject(error as Error);
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
                type: RoomReactionEventType.Reaction,
                reaction: {
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
                },
              }),
            );
          } catch (error: unknown) {
            reject(error as Error);
          }
          done();
        });

        void room.reactions.send({
          type: 'love',
          metadata: { side: 'empire', bla: { abc: true, xyz: 3.14 } },
          headers: { action: 'strike back', number: 1980 },
        });
      }));
  });
});
