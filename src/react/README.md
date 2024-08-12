# Chat React Usage Guide

This document provides a brief guide on how to use custom chat components and hooks provided by the Ably Chat SDK.

## ChatClientProvider

This provider is used to provide the `ChatClient` instance to all child components in your React component tree.

To use it, wrap your component tree with the `ChatClientProvider` and pass in the `ChatClient` instance you wish to
use.

```tsx
import { ChatClientProvider } from '@ably/chat/react';
import * as Ably from 'ably';
import { LogLevel } from '@ably/chat';

const realtimeClient = new Ably.Realtime({ key: 'api-key', clientId: 'clientId' });
const chatClient = new ChatClient(realtimeClient);

const App = () => {
  return (
    <ChatClientProvider client={chatClient}>
      <RestOfYourApp />
    </ChatClientProvider>
  );
};
```

The `ChatClient` instance will now be available to all child components in your React component tree.

### useChatClient

This hook allows you to access the `ChatClient` instance from your React components from the context provided by the
`ChatClientProvider`.

To use it, call the hook in your component, this will retrieve the `ChatClient` instance from the nearest
`ChatClientProvider` in the component tree.

```tsx
import { useChatClient } from '@ably/chat/react';

const MyComponent = () => {
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;
  return <div>Client id is: {clientId}</div>;
};
```

## useChatConnection

This hook allows you to access the connection status of the `ChatClient` instance from your React components.

To use it, call the hook in your component, this will retrieve the connection state from the `ChatClient` of the
nearest `ChatClientProvider`.

It can also be supplied with an optional listener that will receive the underlying connection status changes.

```tsx
import { useChatConnection } from '@ably/chat/react';

const MyComponent = () => {
  const { currentStatus } = useChatConnection({
    onStatusChange: (statusChange) => {
      console.log('Connection status changed to: ', statusChange.current);
    },
  });
  return <div>Connection status is: {currentStatus}</div>;
};
```

## Optional Status Listeners

Most of the hooks detailed below take some optional listeners as input parameters.

Listeners can be provided for events related to the `Room` instance status changes
via `onRoomStatusChange`, the `ChatClient` connection status changes via `onConnectionStatusChange`,
and the discontinuity error events via the `onDiscontinuity` event listener.

All events relate to the `Room` instance of the nearest `RoomProvider` and thus the connection of the `ChatClient`
from the nearest `ChatClientProvider` above it in the component tree.

```tsx
import { useOccupancy } from '@ably/chat/react';

const MyComponent = () => {
  useOccupancy({
    onConnectionStatusChange: (connectionStatusChange) => {
      console.log('Connection status change:', connectionStatusChange);
    },
    onRoomStatusChange: (roomStatusChange) => {
      console.log('Room status change:', roomStatusChange);
    },
    onDiscontinuity: (error) => {
      console.log('Discontinuity detected:', error);
    },
  });
  return <div>Occupancy Component</div>;
};
```

## Optional Status State Return

The hooks that take optional listeners to provide status changes also offer the option of observing
status updates via a state return by the hook.

This state is managed by the hook and will be updated whenever a change occurs.

You can access the `Room` instance status via `roomStatus` and its associated error via `roomError`, as well as
the `ChatClient` connection status via `connectionStatus` and its associated error via `connectionError`.

All events relate to the `Room` instance of the nearest `ChatRoomProvider` and thus the connection of the `ChatClient`
from the nearest `ChatClientProvider` above it in the component tree.

```tsx
import { useSomeHook } from '@ably/chat/react';

const MyComponent = () => {
  const { connectionStatus, connectionError, roomStatus, roomError } = useSomeHook();
  return (
    <div>
      <p>Connection status is: {connectionStatus}</p>
      <p>Connection error is: {connectionError}</p>
      <p>Room status is: {roomStatus}</p>
      <p>Room error is: {roomError}</p>
    </div>
  );
};
```

## useOccupancy

This hook allows you to access the `Occupancy` instance of a `Room` from your React components.

To use it, call the hook in your component, this will retrieve the `Occupancy` instance from the `Room` of the
nearest `ChatRoomProvider`.

You can also be supply an optional listener that will receive the underlying `Occupancy` events.

The hook also returns the current state (connections and presenceMembers) of the `Occupancy` instance, this is kept
up to date internally by the hook.

```tsx
import { useOccupancy } from '@ably/chat/react';

const MyComponent = () => {
  const { connections, presenceMembers } = useOccupancy({
    listener: (occupancyEvent) => {
      console.log('Number of users connected is: ', occupancyEvent.connections);
      console.log('Number of members present is: ', occupancyEvent.presenceMembers);
    },
  });
  return (
    <div>
      <p>Number of users connected is: {connections}</p>
      <p>Number of members present is: {presenceMembers}</p>
    </div>
  );
```

## useRoomReactions

This hook allows you to access the `RoomReactions` instance of a specific room from the nearest `ChatRoomProvider` in the
component tree.

The hook will provide the `RoomReactions` instance, should you wish to interact with it directly, and also a send method
that can be used to send a reaction to the room.

You can also provide an optional listener to the hook that will receive room reactions.

```tsx
import React, { useCallback } from 'react';
import { useRoomReactions } from '@ably/chat/react';

const MyComponent = () => {
  const { send } = useRoomReactions({
    listener: (reaction) => {
      console.log('Received reaction: ', reaction);
    },
  });

  const sendLike = () => {
    send({ type: 'like' });
  };

  return (
    <div>
      <button onClick={sendLike}>Send Like</button>
    </div>
  );
```

## useTyping

This hook allows you to access the `Typing` instance of a Room from your React components.

To use it, call the hook in your component, this will retrieve the `Typing` instance from the room of the
nearest `ChatRoomProvider`.

You can also be supply an optional listener that will receive the underlying typing events,
or use the state object returned by the hook to access the current list of clients currently typing.

```tsx
import { useTyping } from '@ably/chat/react';

const MyComponent = () => {
  const { start, stop, currentlyTyping, error } = useTyping({
    listener: (typingEvent: TypingEvent) => {
      console.log('Typing event received: ', typingEvent);
    },
  });

  const handleStartClick = () => {
    start();
  };

  const handleStopClick = () => {
    stop();
  };

  return (
    <div>
      {error && <p>Typing Error: {error.message}</p>}
      <button onClick={handleStartClick}>Start Typing</button>
      <button onClick={handleStopClick}>Stop Typing</button>
      <p>Currently typing: {currentlyTyping.join(', ')}</p>
    </div>
  );
};
```
