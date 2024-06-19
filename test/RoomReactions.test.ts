import * as Ably from 'ably';
import { beforeEach, describe, expect, it, test, vi } from 'vitest';

import { ChatApi } from '../src/ChatApi.js';
import { DefaultRoom } from '../src/Room.js';
import { makeTestLogger } from './helper/logger.js';
import { testClientOptions } from './helper/options.js';

interface TestContext {
  realtime: Ably.Realtime;
  chatApi: ChatApi;
  publishTimestamp: Date;
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

    const channel = context.realtime.channels.get('abcd::$chat::$reactions');
    const listeners: Ably.messageCallback<Ably.Message>[] = [];
    vi.spyOn(channel, 'subscribe').mockImplementation(
      // @ts-ignore
      async (
        nameOrListener: string | Ably.messageCallback<Ably.Message>,
        listener: Ably.messageCallback<Ably.Message>,
      ) => {
        if (typeof nameOrListener === 'function') {
          listeners.push(nameOrListener);
        } else {
          listeners.push(listener);
        }
        // @ts-ignore
        context.emulateBackendPublish = (msg) => {
          listeners.forEach((listener) => listener(msg));
        };
      },
    );
    vi.spyOn(channel, 'publish').mockImplementation(
      // @ts-ignore
      (name: string, payload: any) => {
        context.emulateBackendPublish({
          name: name,
          data: payload,
          clientId: clientId,
          timestamp: context.publishTimestamp.getTime(),
          encoding: 'json',
        });
        return Promise.resolve();
      },
    );
  });

  describe('receiving a reaction', () => {
    it<TestContext>("should be able to get a reaction from realtime channel and recognize it as being somebody else's", (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = new Date().getTime();
        const { chatApi, realtime } = context;
        const room = new DefaultRoom('abcd', realtime, chatApi, testClientOptions(), makeTestLogger());

        room.reactions
          .subscribe((reaction) => {
            try {
              expect(reaction).toEqual(
                expect.objectContaining({
                  clientId: 'yoda',
                  isSelf: false,
                  createdAt: new Date(publishTimestamp),
                  type: 'like',
                }),
              );
            } catch (err) {
              reject(err);
            }
            done();
          })
          .then(() => {
            context.emulateBackendPublish({
              clientId: 'yoda',
              name: 'roomReaction',
              data: {
                type: 'like',
              },
              timestamp: publishTimestamp,
            });
          })
          .catch((err) => {
            reject(err);
          });
      }));

    it<TestContext>('should be able to get a reaction from realtime channel and recognise it as your own', (context) =>
      new Promise<void>((done, reject) => {
        const publishTimestamp = new Date().getTime();
        const { chatApi, realtime } = context;
        const room = new DefaultRoom('abcd', realtime, chatApi, testClientOptions(), makeTestLogger());

        room.reactions
          .subscribe((reaction) => {
            try {
              expect(reaction).toEqual(
                expect.objectContaining({
                  clientId: 'd.vader',
                  isSelf: true,
                  createdAt: new Date(publishTimestamp),
                  type: 'hate',
                }),
              );
            } catch (err) {
              reject(err);
            }
            done();
          })
          .then(() => {
            context.emulateBackendPublish({
              clientId: 'd.vader',
              name: 'roomReaction',
              data: {
                type: 'hate',
              },
              timestamp: publishTimestamp,
            });
          })
          .catch((err) => {
            reject(err);
          });
      }));
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
          const { chatApi, realtime } = context;
          const room = new DefaultRoom('abcd', realtime, chatApi, testClientOptions(), makeTestLogger());

          room.reactions
            .subscribe(() => {
              reject(new Error('Should not have received a reaction'));
            })
            .then(() => {
              context.emulateBackendPublish(inbound);
            })
            .then(() => {
              done();
            })
            .catch((err) => {
              reject(err);
            });
        }),
    );
  });

  describe('sending a reaction', () => {
    it<TestContext>('should be able to send a reaction and see it back on the realtime channel', (context) =>
      new Promise<void>((done, reject) => {
        const { chatApi, realtime } = context;
        const room = new DefaultRoom('abcd', realtime, chatApi, testClientOptions(), makeTestLogger());

        room.reactions
          .subscribe((reaction) => {
            try {
              expect(reaction).toEqual(
                expect.objectContaining({
                  clientId: 'd.vader',
                  isSelf: true,
                  createdAt: context.publishTimestamp,
                  type: 'love',
                }),
              );
            } catch (err) {
              reject(err);
            }
            done();
          })
          .then(() => {
            return room.reactions.send('love');
          })
          .catch((err) => {
            reject(err);
          });
      }));
  });
});
