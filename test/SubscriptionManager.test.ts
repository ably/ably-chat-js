import { beforeEach, describe, it, expect } from 'vitest';
import { PresenceMessage, RealtimeChannel, Message } from 'ably';
import { ablyRealtimeClient } from './helper/realtimeClient.ts';
import { DefaultSubscriptionManager } from '../src/SubscriptionManager.ts';

interface TestContext {
  channel: RealtimeChannel;
  publishChannel: RealtimeChannel;
  subscriptionManager: DefaultSubscriptionManager;
}

// Wait for the messages to be received
const waitForMessages = (messages: Message[], expectedCount: number) => {
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

// Wait for the channel to change state to the expected state
const waitForChannelStateChange = (channel, expectedState) => {
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
const assertNoChannelStateChange = (channel, expectedState) => {
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

describe('subscription manager', () => {
  beforeEach<TestContext>((context) => {
    const channelName = Math.random().toString(36).substring(7);
    context.channel = ablyRealtimeClient().channels.get(channelName);
    context.publishChannel = ablyRealtimeClient().channels.get(channelName);
    context.subscriptionManager = new DefaultSubscriptionManager(context.channel);
  });

  it<TestContext>('subscribes to channel with implicit attach', async (context) => {
    const { channel, publishChannel, subscriptionManager } = context;

    const receivedMessages: Message[] = [];
    const listener = (message) => {
      receivedMessages.push(message);
    };
    await subscriptionManager.subscribe(['test-event'], listener);
    await waitForChannelStateChange(channel, 'attached');

    // Now we publish using the publisher client and check the listener is called
    await publishChannel.publish('test-event', 'test-message');

    // Wait for the message to be received in the receivedMessages
    await waitForMessages(receivedMessages, 1);

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].data).toBe('test-message');
  });

  it<TestContext>('subscribes to channel with implicit attach on all events', async (context) => {
    const { channel, publishChannel, subscriptionManager } = context;

    const receivedMessages: Message[] = [];
    const listener = (message) => {
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
    expect(receivedMessages[0].data).toBe('test-message');
    expect(receivedMessages[1].data).toBe('another-message');
  });

  it<TestContext>('subscribes to channel with implicit attach on presence all events', async (context) => {
    const { channel, publishChannel, subscriptionManager } = context;

    const receivedMessages: PresenceMessage[] = [];
    const listener = (message) => {
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

    const receivedMessages: PresenceMessage[] = [];
    const listener = (message) => {
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
    expect(receivedMessages[0].action).toBe('update');
    expect(receivedMessages[0].data).toBe('test-message-2');
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
});
