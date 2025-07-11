import * as Ably from 'ably';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatApi } from '../../src/core/chat-api.ts';
import { ConnectionStatus } from '../../src/core/connection.ts';
import { RoomReactionEventType } from '../../src/core/events.ts';
import { Room } from '../../src/core/room.ts';
import { RoomReaction } from '../../src/core/room-reaction.ts';
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

    context.room = makeRandomRoom({
      chatApi: context.chatApi,
      realtime: context.realtime,
    });
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
                name: 'like',
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
            name: 'like',
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
                name: 'hate',
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
            name: 'hate',
          },
          timestamp: publishTimestamp,
        });
      }));
  });

  it<TestContext>('should be able to unsubscribe from reactions', (context) => {
    const publishTimestamp = Date.now();
    const { room } = context;

    const receivedReactions: RoomReaction[] = [];
    const { unsubscribe } = room.reactions.subscribe((event) => {
      receivedReactions.push(event.reaction);
    });

    // Publish the first reaction
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'roomReaction',
      data: {
        name: 'like',
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
        name: 'like',
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
        name: 'like',
      }),
    );
  });

  it<TestContext>('should only unsubscribe the correct subscription', (context) => {
    const publishTimestamp = Date.now();
    const { room } = context;

    const received: string[] = [];
    const listener = (event: { reaction: RoomReaction }) => {
      received.push(event.reaction.name);
    };
    const subscription1 = room.reactions.subscribe(listener);
    const subscription2 = room.reactions.subscribe(listener);

    // Publish first reaction
    context.emulateBackendPublish({
      clientId: 'yoda',
      name: 'roomReaction',
      data: {
        name: 'like',
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
        name: 'love',
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
    [
      'empty client id',
      { clientId: '', name: 'roomReaction', data: { name: 'like' }, timestamp: 123 },
      { expectedClientId: '', expectedType: 'like' },
    ],
    [
      'no client id',
      { name: 'roomReaction', data: { name: 'like' }, timestamp: 123 },
      { expectedClientId: '', expectedType: 'like' },
    ],
    [
      'empty name',
      { clientId: 'abc', name: 'roomReaction', data: { name: '' }, timestamp: 123 },
      { expectedClientId: 'abc', expectedType: '' },
    ],
    [
      'no name',
      { clientId: 'abc', name: 'roomReaction', data: {}, timestamp: 123 },
      { expectedClientId: 'abc', expectedType: '' },
    ],
    [
      'no data',
      { clientId: 'abc', name: 'roomReaction', timestamp: 123 },
      { expectedClientId: 'abc', expectedType: '' },
    ],
  ])(
    'reactions with missing fields: %s',
    (description: string, inbound: object, expected: { expectedClientId: string; expectedType: string }) => {
      test<TestContext>(
        'processes reaction with defaults for: ' + description,
        (context) =>
          new Promise<void>((done, reject) => {
            const { room } = context;

            room.reactions.subscribe((event) => {
              try {
                expect(event.reaction.clientId).toBe(expected.expectedClientId);
                expect(event.reaction.name).toBe(expected.expectedType);
                expect(event.reaction.createdAt).toBeInstanceOf(Date);
                expect(event.reaction.metadata).toEqual({});
                expect(event.reaction.headers).toEqual({});
                done();
              } catch (error) {
                reject(error as Error);
              }
            });

            context.emulateBackendPublish(inbound);
          }),
      );
    },
  );

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
                  name: 'love',
                  headers: {},
                  metadata: {},
                },
              }),
            );

            // Verify the complete published message structure
            expect(publishSpy).toHaveBeenCalledWith({
              name: 'roomReaction',
              data: {
                name: 'love',
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

        void room.reactions.send({ name: 'love' });
      }));

    // CHA-ER3f
    it<TestContext>('should reject when sending a reaction while not connected to Ably', async (context) => {
      const { room } = context;

      // Mock connection status to be disconnected
      vi.spyOn(context.realtime.connection, 'state', 'get').mockReturnValue(ConnectionStatus.Disconnected);

      await expect(room.reactions.send({ name: 'love' })).rejects.toBeErrorInfoWithCode(40000);
    });

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
                  name: 'love',
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
          name: 'love',
          metadata: { side: 'empire', bla: { abc: true, xyz: 3.14 } },
          headers: { action: 'strike back', number: 1980 },
        });
      }));
  });
});
