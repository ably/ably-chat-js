import { ChatClient, PresenceData, PresenceEvent, PresenceEvents, RoomOptionsDefaults } from '@ably/chat';
import { cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { usePresence } from '../../../src/react/hooks/use-presence.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { randomRoomId } from '../../helper/identifier.ts';

const waitToReceivePresenceEvent = (
  event: { clientId: string; data: unknown; event: PresenceEvents },
  presenceEvents: PresenceEvent[],
) =>
  new Promise<void>((resolve, reject) => {
    const interval = setInterval(() => {
      for (const presenceEvent of presenceEvents) {
        if (
          presenceEvent.data === event.data &&
          presenceEvent.clientId === event.clientId &&
          presenceEvent.action === event.event
        ) {
          // Remove the event from the array, in a mutative way - so that we consider this event seen
          presenceEvents.splice(presenceEvents.indexOf(presenceEvent), 1);

          clearInterval(interval);
          resolve();
          return;
        }
      }
    }, 100);
    setTimeout(() => {
      clearInterval(interval);
      reject(new Error('Timed out waiting for presence event'));
    }, 20000);
  });

describe('usePresence', () => {
  afterEach(() => {
    cleanup();
  });

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

    await waitFor(
      () => {
        expect(isPresentState).toBe(true);
      },
      { timeout: 5000 },
    );

    // expect a presence enter and update event from the test component to be received by the second room
    await waitToReceivePresenceEvent(
      { clientId: chatClientOne.clientId, event: PresenceEvents.Enter, data: 'test enter' },
      presenceEventsRoomTwo,
    );
    await waitToReceivePresenceEvent(
      { clientId: chatClientOne.clientId, event: PresenceEvents.Update, data: 'test update' },
      presenceEventsRoomTwo,
    );

    // unmount the component
    unmount();

    // expect a presence leave event from the test component to be received by the second room
    await waitToReceivePresenceEvent(
      { clientId: chatClientOne.clientId, event: PresenceEvents.Leave, data: 'test leave' },
      presenceEventsRoomTwo,
    );
  }, 20000);
});
