import { ChatClient, PresenceData, PresenceEvent, RoomOptionsDefaults } from '@ably/chat';
import { render } from '@testing-library/react';
import React, { useEffect } from 'react';
import { describe, expect, it } from 'vitest';

import { usePresence } from '../../../src/react/hooks/use-presence.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomId } from '../../helper/identifier.ts';

function waitForPresenceEvents(presenceEvents: PresenceEvent[], expectedCount: number) {
  return new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      if (presenceEvents.length === expectedCount) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for presence events'));
    }, 20000);
  });
}

describe('usePresence', () => {
  it('should send presence events', async () => {
    // create new clients
    const chatClientOne = newChatClient() as unknown as ChatClient;
    const chatClientTwo = newChatClient() as unknown as ChatClient;

    // create a second room and attach it, so we can listen for presence events
    const roomId = randomRoomId();
    const roomTwo = chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
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
      const { update, isPresent } = usePresence({ enterWithData, leaveWithData });

      // the effect should send a presence update
      useEffect(() => {
        // wait till we have entered presence
        if (!isPresent) return;
        // send a presence update event
        setTimeout(() => void update('test update'), 500);
      }, [isPresent, update]);

      isPresentState = isPresent;

      return null;
    };

    const TestProvider = () => (
      <ChatClientProvider client={chatClientOne}>
        <ChatRoomProvider
          id={roomId}
          options={RoomOptionsDefaults}
        >
          <TestComponent
            enterWithData={'test enter'}
            leaveWithData={'test leave'}
          />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    const { unmount } = render(<TestProvider />);

    // expect a presence enter and update event from the test component to be received by the second room
    await waitForPresenceEvents(presenceEventsRoomTwo, 2);
    expect(presenceEventsRoomTwo[0]?.clientId).toBe(chatClientOne.clientId);
    expect(presenceEventsRoomTwo[0]?.data).toBe('test enter');
    expect(presenceEventsRoomTwo[1]?.clientId).toBe(chatClientOne.clientId);
    expect(presenceEventsRoomTwo[1]?.data).toBe('test update');
    expect(isPresentState).toBe(true);

    unmount();
    // expect a presence leave event from the test component to be received by the second room
    await waitForPresenceEvents(presenceEventsRoomTwo, 3);
    expect(presenceEventsRoomTwo[2]?.clientId).toBe(chatClientOne.clientId);
    expect(presenceEventsRoomTwo[2]?.data).toBe('test leave');
  }, 20000);
});
