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

    // create a second room and attach it, so we can listen for presence events
    const roomName = randomRoomName();
    const roomTwo = await chatClientTwo.rooms.get(roomName);
    await roomTwo.attach();

    // start listening for presence events on room two
    const presenceEventsRoomTwo: PresenceEvent[] = [];
    roomTwo.presence.subscribe((presenceEvent) => presenceEventsRoomTwo.push(presenceEvent));

    let isPresentState = false;

    const TestComponent = ({
      enterWithData,
      leaveWithData,
    }: {
      enterWithData: PresenceData;
      leaveWithData: PresenceData;
    }) => {
      const { update, userPresenceState } = usePresence({ enterWithData, leaveWithData });

      // the effect should send a presence update
      useEffect(() => {
        // wait till we have entered presence
        if (!userPresenceState.isPresent) return;
        // send a presence update event
        setTimeout(() => void update('test update'), 500);
      }, [userPresenceState.isPresent, update]);

      isPresentState = userPresenceState.isPresent;

      return null;
    };
    const Providers = ({ children }: React.PropsWithChildren) => (
      <ChatClientProvider client={chatClientOne}>
        <ChatRoomProvider name={roomName}>{children}</ChatRoomProvider>
      </ChatClientProvider>
    );

    const { unmount, rerender } = render(
      <Providers>
        <TestComponent
          enterWithData={'test enter'}
          leaveWithData={'test leave'}
        />
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
    await waitForExpectedPresenceEvent(
      { clientId: chatClientOne.clientId, type: PresenceEventType.Leave, data: 'test leave' },
      presenceEventsRoomTwo,
    );

    // cleanup
    unmount();
  }, 20000);
});
