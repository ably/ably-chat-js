import { cleanup, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { PresenceEvent, PresenceListener, PresenceMember } from '../../../src/core/presence.ts';
import { RoomStatus } from '../../../src/core/room-status.ts';
import { usePresenceListener } from '../../../src/react/hooks/use-presence-listener.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { waitForArrayLength } from '../../helper/common.ts';
import { randomRoomName } from '../../helper/identifier.ts';

describe('usePresenceListener', () => {
  afterEach(() => {
    cleanup();
  });

  it('should correctly listen to presence events', async () => {
    // create new clients
    const chatClientOne = newChatClient();
    const chatClientTwo = newChatClient();

    // create a second room and attach it, so we can send presence events with it
    const roomName = randomRoomName();
    const roomTwo = await chatClientTwo.rooms.get(roomName);
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
        <ChatRoomProvider name={roomName}>
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
    await waitForArrayLength(presenceEventsReceived, 2);
    expect(presenceEventsReceived[0]?.member.clientId).toBe(chatClientTwo.clientId);
    expect(presenceEventsReceived[0]?.member.data).toBe('test enter');
    expect(presenceEventsReceived[1]?.member.clientId).toBe(chatClientTwo.clientId);
    expect(presenceEventsReceived[1]?.member.data).toBe('test update');

    // expect the current presence state to reflect only the latest presence data
    expect(currentPresenceData.length).toBe(1);
    expect(currentPresenceData[0]?.clientId).toBe(chatClientTwo.clientId);
    expect(currentPresenceData[0]?.data).toBe('test update');
  }, 20000);
});
