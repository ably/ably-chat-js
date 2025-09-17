import { cleanup, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { PresenceEventType } from '../../../src/core/events.ts';
import { PresenceData, PresenceEvent } from '../../../src/core/presence.ts';
import { usePresence } from '../../../src/react/hooks/use-presence.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { waitForExpectedPresenceEvent } from '../../helper/common.ts';
import { randomRoomName } from '../../helper/identifier.ts';

describe('usePresence', () => {
  afterEach(() => {
    cleanup();
  });

  it('should send presence events', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();
    const logger = chatClientTwo.logger;

    // create a second room and attach it, so we can listen for presence events
    const roomName = randomRoomName();
    const roomTwo = await chatClientTwo.rooms.get(roomName);
    await roomTwo.attach();

    // start listening for presence events on room two
    const presenceEventsRoomTwo: PresenceEvent[] = [];
    roomTwo.presence.subscribe((presenceEvent) => {
      logger.debug('received presence event', presenceEvent);
      presenceEventsRoomTwo.push(presenceEvent);
    });

    let isPresentState = false;

    // Before we mount the component, we're going to call presence.get() to force
    // the SYNC to complete. If we don't do this, then events later may be either
    // present OR enter, which is brittle to assert on. This guarantees that we get enter
    // by not entering presence until sync is complete.
    await roomTwo.presence.get();

    const TestComponent = ({ initialData }: { initialData: PresenceData }) => {
      const { update, myPresenceState } = usePresence({ initialData });

      // the effect should send a presence update
      useEffect(() => {
        // wait till we have entered presence
        if (!myPresenceState.present) return;
        // send a presence update event
        setTimeout(() => void update('test update'), 500);
      }, [myPresenceState.present, update]);

      isPresentState = myPresenceState.present;

      return null;
    };
    const Providers = ({ children }: React.PropsWithChildren) => (
      <ChatClientProvider client={chatClientOne}>
        <ChatRoomProvider name={roomName}>{children}</ChatRoomProvider>
      </ChatClientProvider>
    );

    const { unmount, rerender } = render(
      <Providers>
        <TestComponent initialData={'test enter'} />
      </Providers>,
    );

    await waitFor(
      () => {
        expect(isPresentState).toBe(true);
      },
      { timeout: 5000 },
    );

    // expect a presence enter and update event from the test component to be received by the second room
    await waitForExpectedPresenceEvent(
      { clientId: chatClientOne.clientId, type: PresenceEventType.Enter, data: 'test enter' },
      presenceEventsRoomTwo,
    );
    await waitForExpectedPresenceEvent(
      { clientId: chatClientOne.clientId, type: PresenceEventType.Update, data: 'test update' },
      presenceEventsRoomTwo,
    );

    // Remove TestComponent while keeping Providers intact
    rerender(<Providers></Providers>);

    // expect a presence leave event from the test component to be received by the second room
    // it will have the data of whatever was in the presence set at the time
    await waitForExpectedPresenceEvent(
      { clientId: chatClientOne.clientId, type: PresenceEventType.Leave, data: 'test update' },
      presenceEventsRoomTwo,
    );

    // cleanup
    unmount();
  }, 20000);

  it('should update presence state when room detaches and reattaches', async () => {
    const chatClient = newChatClient();
    const roomName = randomRoomName();

    let presenceState = { present: false };

    const TestComponent = () => {
      const { myPresenceState } = usePresence({ initialData: { status: 'online' } });

      presenceState = myPresenceState;

      return null;
    };

    const Providers = ({ children }: React.PropsWithChildren) => (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider name={roomName}>{children}</ChatRoomProvider>
      </ChatClientProvider>
    );

    const { unmount } = render(
      <Providers>
        <TestComponent />
      </Providers>,
    );

    // Get the room instance to control its state
    const room = await chatClient.rooms.get(roomName);

    // Wait for room to attach and presence to be present
    await room.attach();
    await waitFor(
      () => {
        expect(presenceState.present).toBe(true);
      },
      { timeout: 5000 },
    );

    // Detach the room
    await room.detach();

    // Wait for presence state to become false
    await waitFor(
      () => {
        expect(presenceState.present).toBe(false);
      },
      { timeout: 5000 },
    );

    // Reattach the room
    await room.attach();

    // Wait for presence state to become true again
    await waitFor(
      () => {
        expect(presenceState.present).toBe(true);
      },
      { timeout: 5000 },
    );

    // cleanup
    unmount();
  }, 20000);
});
