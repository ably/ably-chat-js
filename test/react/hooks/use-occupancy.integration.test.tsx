import { OccupancyEvent, OccupancyListener, RoomOptionsDefaults } from '@ably/chat';
import { cleanup, render } from '@testing-library/react';
import { dequal } from 'dequal';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { useOccupancy } from '../../../src/react/hooks/use-occupancy.ts';
import { ChatClientProvider } from '../../../src/react/providers/chat-client-provider.tsx';
import { ChatRoomProvider } from '../../../src/react/providers/chat-room-provider.tsx';
import { newChatClient } from '../../helper/chat.ts';
import { waitForExpectedInbandOccupancy } from '../../helper/common.ts';
import { randomRoomId } from '../../helper/identifier.ts';

describe('useOccupancy', () => {
  afterEach(() => {
    cleanup();
  });

  it('should receive occupancy updates', { timeout: 20000 }, async () => {
    // create new clients
    const chatClient = newChatClient();
    const chatClientTwo = newChatClient();
    const chatClientThree = newChatClient();

    // create two more rooms and attach to contribute towards occupancy metrics
    const roomId = randomRoomId();
    const roomTwo = await chatClientTwo.rooms.get(roomId, RoomOptionsDefaults);
    const roomThree = await chatClientThree.rooms.get(roomId, RoomOptionsDefaults);
    await roomTwo.attach();
    await roomThree.attach();

    // join presence to contribute to present members metric
    await roomTwo.presence.enter();
    await roomThree.presence.enter();

    // store for the state received from the hook
    let occupancyState: { connections: number; presenceMembers: number } = { connections: 0, presenceMembers: 0 };

    const TestComponent = ({ listener }: { listener: OccupancyListener }) => {
      const { connections, presenceMembers } = useOccupancy({ listener: listener });

      occupancyState = { connections, presenceMembers };

      return null;
    };

    // store the received occupancy metrics
    const occupancyEvents: OccupancyEvent[] = [];

    const TestProvider = () => (
      <ChatClientProvider client={chatClient}>
        <ChatRoomProvider
          id={roomId}
          options={RoomOptionsDefaults}
        >
          <TestComponent listener={(occupancyEvent) => occupancyEvents.push(occupancyEvent)} />
        </ChatRoomProvider>
      </ChatClientProvider>
    );

    render(<TestProvider />);

    // if we already have expected occupancy, then we don't need to wait for the event
    const expectedOccupancy = { connections: 3, presenceMembers: 2 };
    if (dequal(expectedOccupancy, occupancyState)) {
      return;
    }

    // we don't have the requested occupancy yet, so wait for the occupancy events to be received
    await waitForExpectedInbandOccupancy(occupancyEvents, { connections: 3, presenceMembers: 2 }, 20000);

    // check the occupancy metrics
    expect(occupancyState.connections).toBe(3);
    expect(occupancyState.presenceMembers).toBe(2);
  });
});
