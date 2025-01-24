import { cleanup, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { PresenceEvent, PresenceListener, PresenceMember } from '../../../core/src/presence.ts';
import { RoomOptionsDefaults } from '../../../core/src/room-options.ts';
import { RoomStatus } from '../../../core/src/room-status.ts';
import { usePresenceListener } from '../../src/hooks/use-presence-listener.ts';
import { ChatClientProvider } from '../../src/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../src/providers/chat-room-provider.tsx';
import { newChatClient } from '../../../shared/testhelper/chat.ts';
import { randomRoomId } from '../../../shared/testhelper/identifier.ts';

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
    }, 10000);
  });
}

describe('usePresenceListener', () => {
  afterEach(() => {
    cleanup();
  });

  it('should correctly listen to presence events', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room and attach it, so we can send presence events with it
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();

    // store the current presence member state
    let currentPresenceData: PresenceMember[] = [];

    let currentRoomStatus: RoomStatus;
    const TestComponent = ({ listener }: { listener: PresenceListener }) => {
      const { presenceData, roomStatus } = usePresenceListener({ listener });

      useEffect(() => {
        currentPresenceData = presenceData;
      }, [presenceData]);

      currentRoomStatus = roomStatus;

      return null;
    };

    // store the presence events received by the test component
    const presenceEventsReceived: PresenceEvent[] = [];

    const TestProvider = () => (
      <ChatClientProvider client={chatClientOne}>
        <ChatRoomProvider
          id={roomId}
          options={RoomOptionsDefaults}
        >
          <TestComponent
            listener={(event: PresenceEvent) => {
              presenceEventsReceived.push(event);
            }}
          />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);

    // ensure we are attached first
    await waitFor(
      () => {
        expect(currentRoomStatus).toBe(RoomStatus.Attached);
      },
      { timeout: 5000 },
    );

    // enter presence with room two, then update the presence state
    await roomTwo.presence.enter('test enter');
    await roomTwo.presence.update('test update');

    // expect a presence enter and update event from the test component to be received
    await waitForPresenceEvents(presenceEventsReceived, 2);
    expect(presenceEventsReceived[0]?.clientId).toBe(chatClientTwo.clientId);
    expect(presenceEventsReceived[0]?.data).toBe('test enter');
    expect(presenceEventsReceived[1]?.clientId).toBe(chatClientTwo.clientId);
    expect(presenceEventsReceived[1]?.data).toBe('test update');

    // expect the current presence state to reflect only the latest presence data
    expect(currentPresenceData.length).toBe(1);
    expect(currentPresenceData[0]?.clientId).toBe(chatClientTwo.clientId);
    expect(currentPresenceData[0]?.data).toBe('test update');
  }, 20000);
});
