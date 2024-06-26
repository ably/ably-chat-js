import * as Ably from 'ably';
import { beforeEach, describe, expect, it } from 'vitest';

import { DefaultSubscriptionManager } from '../src/SubscriptionManager.ts';
import { randomString } from './helper/identifier.ts';
import { makeTestLogger } from './helper/logger.ts';
import { ablyRealtimeClient } from './helper/realtimeClient.ts';

interface TestContext {
  channel: Ably.RealtimeChannel;
  publishChannel: Ably.RealtimeChannel;
  subscriptionManager: DefaultSubscriptionManager;
  defaultClientId: string;
}

// Wait for the messages to be received
const waitForMessages = (messages: Ably.Message[], expectedCount: number) => {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (messages.length === expectedCount) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for messages'));
    }, 3000);
  });
};

// Wait for a presence event of a given action to be received
const waitForPresenceEvent = (
  messages: Ably.PresenceMessage[],
  expectedAction: string,
): Promise<Ably.PresenceMessage> => {
  return new Promise<Ably.PresenceMessage>((resolve, reject) => {
    const interval = setInterval(() => {
      const message = messages.find((m) => m.action === expectedAction);
      if (message) {
        clearInterval(interval);
        resolve(message);
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for presence event'));
    }, 3000);
  });
};

// Wait for the channel to change state to the expected state
const waitForChannelStateChange = (channel: Ably.RealtimeChannel, expectedState: Ably.ChannelState) => {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (channel.state === expectedState) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for channel state change'));
    }, 3000);
  });
};

// Assert that a channel does not enter the expected state
// during the interval
const assertNoChannelStateChange = (channel: Ably.RealtimeChannel, expectedState: Ably.ChannelState) => {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (channel.state === expectedState) {
        clearInterval(interval);
        reject(new Error('Channel entered unexpected state'));
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, 3000);
  });
};

describe('subscription manager', { timeout: 15000 }, () => {
  beforeEach<TestContext>((context) => {
    const channelName = randomString();
    const ablyRealtime = ablyRealtimeClient();
    context.channel = ablyRealtime.channels.get(channelName);
    context.publishChannel = ablyRealtimeClient().channels.get(channelName);
    context.subscriptionManager = new DefaultSubscriptionManager(context.channel, makeTestLogger());
    context.defaultClientId = ablyRealtime.auth.clientId;
  });

  it<TestContext>('subscribes to channel with implicit attach', async (context) => {
    const { channel, publishChannel, subscriptionManager } = context;

    const receivedMessages: Ably.Message[] = [];
    const listener = (message: Ably.Message) => {
      receivedMessages.push(message);
    };
    await subscriptionManager.subscribe(['test-event'], listener);
    await waitForChannelStateChange(channel, 'attached');

    // Now we publish using the publisher client and check the listener is called
    await publishChannel.publish('test-event', 'test-message');

    // Wait for the message to be received in the receivedMessages
    await waitForMessages(receivedMessages, 1);

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0]?.data).toBe('test-message');
  });

  it<TestContext>('subscribes to channel with implicit attach on all events', async (context) => {
    const { channel, publishChannel, subscriptionManager } = context;

    const receivedMessages: Ably.Message[] = [];
    const listener = (message: Ably.Message) => {
      receivedMessages.push(message);
    };
    await subscriptionManager.subscribe(listener);
    await waitForChannelStateChange(channel, 'attached');

    // Now we publish using the publisher client and check the listener is called
    await publishChannel.publish('test-event', 'test-message');
    await publishChannel.publish('another-event', 'another-message');

    // Wait for the message to be received in the receivedMessages
    await waitForMessages(receivedMessages, 2);

    expect(receivedMessages.length).toBe(2);
    expect(receivedMessages[0]?.data).toBe('test-message');
    expect(receivedMessages[1]?.data).toBe('another-message');
  });

  it<TestContext>('subscribes to channel with implicit attach on presence all events', async (context) => {
    const { channel, publishChannel, subscriptionManager } = context;

    const receivedMessages: Ably.PresenceMessage[] = [];
    const listener = (message: Ably.PresenceMessage) => {
      receivedMessages.push(message);
    };
    await subscriptionManager.presenceSubscribe(listener);
    await waitForChannelStateChange(channel, 'attached');

    // Now we enter presence using the publisher client and check the listener is called
    await publishChannel.presence.enter('test-message');

    // Wait for the message to be received in the receivedMessages
    await waitForMessages(receivedMessages, 1);
    expect(receivedMessages.length).toBe(1);
  });

  it<TestContext>('subscribes to channel with implicit attach on presence select events', async (context) => {
    const { channel, publishChannel, subscriptionManager } = context;

    const receivedMessages: Ably.PresenceMessage[] = [];
    const listener = (message: Ably.PresenceMessage) => {
      receivedMessages.push(message);
    };
    await subscriptionManager.presenceSubscribe('update', listener);
    await waitForChannelStateChange(channel, 'attached');

    // Now we enter presence using the publisher client and check the listener is called
    await publishChannel.presence.enter('test-message');

    // Do a presence update
    await publishChannel.presence.update('test-message-2');

    // Wait for the message to be received in the receivedMessages
    await waitForMessages(receivedMessages, 1);
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0]?.action).toBe('update');
    expect(receivedMessages[0]?.data).toBe('test-message-2');
  });

  it<TestContext>('unsubscribes from channel with implicit detach if last messages listener', async (context) => {
    const { channel, subscriptionManager } = context;

    const listener = () => {};
    await subscriptionManager.subscribe(['test-event'], listener);
    await waitForChannelStateChange(channel, 'attached');

    // Now we unsubscribe and check the channel is detached
    await subscriptionManager.unsubscribe(listener);

    // wait for the channel to detach
    await waitForChannelStateChange(channel, 'detached');
  });

  it<TestContext>('unsubscribes from channel with implicit detach if last presence listener', async (context) => {
    const { channel, subscriptionManager } = context;

    const listener = () => {};
    await subscriptionManager.presenceSubscribe(listener);
    await waitForChannelStateChange(channel, 'attached');

    // Now we unsubscribe and check the channel is detached
    await subscriptionManager.presenceUnsubscribe(listener);

    // Wait for the channel to detach
    await waitForChannelStateChange(channel, 'detached');
  });

  it<TestContext>(
    'does not detach channel if there are multiple presence listeners',
    { timeout: 10000 },
    async (context) => {
      const { channel, subscriptionManager } = context;

      const listener1 = () => {};
      const listener2 = () => {};
      await subscriptionManager.presenceSubscribe(listener1);
      await subscriptionManager.presenceSubscribe(listener2);
      await waitForChannelStateChange(channel, 'attached');

      // Now we unsubscribe one listener and check the channel is still attached
      await subscriptionManager.presenceUnsubscribe(listener1);

      // Assert no channel detachments
      await assertNoChannelStateChange(channel, 'detached');
    },
  );

  it<TestContext>(
    'does not detach channel if there are multiple message listeners',
    { timeout: 10000 },
    async (context) => {
      const { channel, subscriptionManager } = context;

      const listener1 = () => {};
      const listener2 = () => {};
      await subscriptionManager.subscribe(['test-event'], listener1);
      await subscriptionManager.subscribe(['test-event'], listener2);
      await waitForChannelStateChange(channel, 'attached');

      // Now we unsubscribe one listener and check the channel is still attached
      await subscriptionManager.unsubscribe(listener1);

      // Assert no channel detachments
      await assertNoChannelStateChange(channel, 'detached');
    },
  );

  it<TestContext>(
    'does not detach channel if there are multiple message and presence listeners',
    { timeout: 10000 },
    async (context) => {
      const { channel, subscriptionManager } = context;

      const listener1 = () => {};
      const listener2 = () => {};
      await subscriptionManager.subscribe(['test-event'], listener1);
      await subscriptionManager.presenceSubscribe(listener2);
      await waitForChannelStateChange(channel, 'attached');

      // Now we unsubscribe one listener and check the channel is still attached
      await subscriptionManager.unsubscribe(listener1);

      // Assert no channel detachments
      await assertNoChannelStateChange(channel, 'detached');

      // Now we unsubscribe the other listener and check the channel is detached
      await subscriptionManager.presenceUnsubscribe(listener2);

      // Wait for the channel to detach
      await waitForChannelStateChange(channel, 'detached');
    },
  );
  it<TestContext>('should attach to the channel when entering presence', async (context) => {
    const { channel, subscriptionManager } = context;
    // sending an enter should implicitly attach the channel
    await subscriptionManager.presenceEnterClient(context.defaultClientId);
    await waitForChannelStateChange(channel, 'attached');
  });
  it<TestContext>('should emit an enter event with supplied data when entering presence', async (context) => {
    const receivedMessages: Ably.PresenceMessage[] = [];
    const listener = (message: Ably.PresenceMessage) => {
      receivedMessages.push(message);
    };
    // subscribe to presence events
    await context.subscriptionManager.presenceSubscribe(listener);
    // enter presence and wait for the event
    await context.subscriptionManager.presenceEnterClient(context.defaultClientId, 'test-data');
    // should receive one enter event
    await waitForMessages(receivedMessages, 1);
    expect(receivedMessages[0]?.action).toBe('enter');
    expect(receivedMessages[0]?.data).toBe('test-data');
  });
  it<TestContext>('should attach to the channel when updating presence', async (context) => {
    const { channel, subscriptionManager } = context;
    // sending an update should implicitly attach the channel
    await subscriptionManager.presenceUpdateClient(context.defaultClientId);
    await waitForChannelStateChange(channel, 'attached');
  });

  it<TestContext>('should emit an event enter when joining for the first time', async (context) => {
    const receivedMessages: Ably.PresenceMessage[] = [];
    const listener = (message: Ably.PresenceMessage) => {
      receivedMessages.push(message);
    };
    // subscribe to presence events
    await context.subscriptionManager.presenceSubscribe(listener);
    // update presence, triggering an enter event
    await context.subscriptionManager.presenceEnterClient(context.defaultClientId, 'test-data');
    // should receive one enter event
    const presenceEvent = await waitForPresenceEvent(receivedMessages, 'enter');
    expect(presenceEvent.data).toBe('test-data');
  });

  it<TestContext>('should emit an update event if already entered presence', async (context) => {
    const receivedMessages: Ably.PresenceMessage[] = [];
    const listener = (message: Ably.PresenceMessage) => {
      receivedMessages.push(message);
    };
    // Join presence first
    await context.subscriptionManager.presenceEnterClient(context.defaultClientId);
    // subscribe to presence events
    await context.subscriptionManager.presenceSubscribe(listener);
    // update presence and wait for the event
    await context.subscriptionManager.presenceUpdateClient(context.defaultClientId, 'test-data');
    // should receive an update event - this may come after a 'present' from  the initial enter
    const presenceMessage = await waitForPresenceEvent(receivedMessages, 'update');
    expect(presenceMessage.data).toBe('test-data');
  });

  it<TestContext>('should leave presence and detach from the channel if no listeners are subscribed', async (context) => {
    const { channel, subscriptionManager } = context;
    // sending an enter should implicitly attach the channel
    await subscriptionManager.presenceEnterClient(context.defaultClientId);

    // trigger a leave event and detach from the channel
    await subscriptionManager.presenceLeaveClient(context.defaultClientId);
    await waitForChannelStateChange(channel, 'detached');
  });

  it<TestContext>('should leave presence, but not detach from the channel if listeners are still subscribed', async (context) => {
    const { channel, subscriptionManager } = context;
    // Add a listener, which implicitly attaches, should prevent the channel from detaching during the leave event
    await subscriptionManager.presenceSubscribe(() => {});
    // trigger a leave event
    await subscriptionManager.presenceLeaveClient(context.defaultClientId);
    // should not detach from the channel
    await assertNoChannelStateChange(channel, 'detached');
  });

  it<TestContext>('should emit a leave event with supplied data when leaving presence', async (context) => {
    const receivedMessages: Ably.PresenceMessage[] = [];
    const listener = (message: Ably.PresenceMessage) => {
      receivedMessages.push(message);
    };
    // subscribe to presence events
    await context.subscriptionManager.presenceSubscribe(listener);

    // enter presence and wait for the event
    await context.subscriptionManager.presenceEnterClient(context.defaultClientId, 'test-data');
    const enterMessage = await waitForPresenceEvent(receivedMessages, 'enter');
    expect(enterMessage.data).toBe('test-data');

    // leave presence and wait for the leave event
    await context.subscriptionManager.presenceLeaveClient(context.defaultClientId, 'test-data-leave');
    const leaveEvent = await waitForPresenceEvent(receivedMessages, 'leave');
    expect(leaveEvent.data).toBe('test-data-leave');
  });
});
