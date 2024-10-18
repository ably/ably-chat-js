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

## Optional Status Listeners

Most of the hooks detailed below take some optional listeners as input parameters.

At a client-level, changes to the connection status can be subscribed to by providing an `onConnectionStatusChange` listener. The events pertain to the `ChatClient` registered with the nearest parent `ChatClientProvider` in the component tree.

Listeners can be provided for events related to a particular `Room` instances status changes via `onRoomStatusChange`. Furthermore, discontinuities in the event stream for room features can be monitored via the `onDiscontinuity` event listener. Room-level events pertain to the nearest parent `RoomProvider` in the React component tree.

Changing the value provided for each of the available listeners will cause the previously registered listener instance to stop receiving events. However, all message events will be received by exactly one listener. If your listener becomes `undefined`, then the subscription will be removed.

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

## ChatRoomProvider

The `ChatRoomProvider` provides access to a specific chat room to all child components in the component tree. To use it,
pass in the id of the room you wish to use, as well as the desired room options (i.e. configuration for each feature):

```tsx
import { ChatClientProvider, ChatRoomProvider } from '@ably/chat/react';
import * as Ably from 'ably';
import { LogLevel, RoomOptionsDefaults } from '@ably/chat';

const realtimeClient = new Ably.Realtime({ key: 'api-key', clientId: 'clientId' });
const chatClient = new ChatClient(realtimeClient);

const App = () => {
  return (
    <ChatClientProvider client={chatClient}>
      <ChatRoomProvider
        id="my-room-id"
        // The value passed to options should be memoized, or use the defaults.
        options={RoomOptionsDefaults}
      >
        <RestOfYourApp />
      </ChatRoomProvider>
    </ChatClientProvider>
  );
};
```

By default, the `ChatRoomProvider` will automatically call `attach()` on the room when it first mounts, and will subsequently call `release()` when it unmounts. If you do not wish for this behavior, you may set the `attach` parameter to `false`, which will allow you to manually control the attachment via the `useRoom` hook (see below). You may also inhibit the `release` behavior, to simply only `detach` the room when the component unmounts.

> [!IMPORTANT]
> The `ChatClientProvider` does **not** memoize the value passed in to the `options` parameter. If the value changes between re-renders, then the chat room will be discarded and recreated with the new options. To prevent a parent component re-render causing the `ChatRoomProvider` to re-render, be sure to memoize / provide a stable reference to, your desired room options.

To use the room-level hooks below, you **must** wrap any components utilizing the hooks inside a `ChatRoomProvider`.

## useRoom

The `useRoom` hook provides direct access to the `Room` object provided by the nearest parent `ChatRoomProvider`. Unless you are intending to explicitly control the room lifecycle (see `ChatRoomProvider`), you probably won't need to use this hook and can instead use feature-specific hooks such as `useMessages`.

```tsx
import { useRoom } from '@ably/chat/react';

const MyComponent = () => {
  const { attach } = useRoom();
  return (
    <div>
      <button onClick={attach}>Attach Me!</button>
    </div>
  );
};
```

## useMessages

This hook allows you to access the `Messages` instance of a `Room` from your React components.

**To use this hook, the component calling it must be a child of a `ChatRoomProvider`.**

### Sending And Getting Messages

The hook will provide the `Messages` instance, should you wish to interact with it directly, a `send` method
that can be used to send a messages to the room, and a `get` method that can be used to retrieve messages from the room.

```tsx
import { useMessages } from '@ably/chat/react';

const MyComponent = () => {
  const { send, get } = useMessages();

  const handleGetMessages = () => {
    // fetch the last 3 messages, oldest to newest
    get({ limit: 3, direction: 'forwards' }).then((result) => console.log('Previous messages: ', result.items));
  };

  const handleMessageSend = () => {
    send({ text: 'Hello, World!' });
  };

  return (
    <div>
      <button onClick={handleMessageSend}>Send Message</button>
      <button onClick={handleGetMessages}>Get Messages</button>
    </div>
  );
};
```

### Subscribing To Messages

You can provide an optional listener that will receive the messages sent to the room; if provided, the hook will
automatically subscribe to messages in the room. As long as a defined value is provided, the subscription will persist
across renders: making your listener value `undefined` will cause the subscription to be removed until it becomes defined
again.

Additionally, providing the listener will allow you to access the `getPreviousMessages` method, which can be used to
fetch previous messages up until the listener was subscribed.

The `getPreviousMessages` method can be useful when recovering from a discontinuity event, as it allows you to fetch all
the messages that were missed while the listener was not subscribed. As long as you provide a defined value for the
listener (and there are no message discontinuities), `getPreviousMessages` will consistently return messages from the
same point across renders. However, if your listener becomes `undefined`, then the subscription to messages will be
removed meaning that, if you then re-define your listener, `getPreviousMessages` will now return messages from the
new subscription point.

```tsx
import { useEffect, useState } from 'react';
import { useMessages } from '@ably/chat/react';

const MyComponent = () => {
  const [loading, setLoading] = useState(true);

  const { getPreviousMessages } = useMessages({
    listener: (message) => {
      console.log('Received message: ', message);
    },
    onDiscontinuity: (error) => {
      console.log('Discontinuity detected:', error);
      setLoading(true);
    },
  });

  useEffect(() => {
    // once the listener is subscribed, `getPreviousMessages` will become available
    if (getPreviousMessages && loading) {
      getPreviousMessages({ limit: 10 }).then((result) => {
        console.log('Previous messages: ', result.items());
        setLoading(false);
      });
    }
  }, [getPreviousMessages, loading]);

  return <div>...</div>;
};
```

## useOccupancy

This hook allows you to access the `Occupancy` instance of a `Room` from your React components.

**To use this hook, the component calling it must be a child of a `ChatRoomProvider`.**

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
};
```

## useRoomReactions

This hook allows you to access the `RoomReactions` instance of a `Room` from your React components.

**To use this hook, the component calling it must be a child of a `ChatRoomProvider`.**

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
};
```

## useTyping

This hook allows you to access the `Typing` instance of a `Room` from your React components.

**To use this hook, the component calling it must be a child of a `ChatRoomProvider`.**

To use it, call the hook in your component, this will retrieve the `Typing` instance from the room of the
nearest `ChatRoomProvider`.

You can also be supply an optional listener that will receive the underlying typing events,
or use the state object returned by the hook to access the current list of clients currently typing.

**The default timeout on the typing indicator can be configured in the `options` parameter you provided
to the `ChatRoomProvider`.**

```tsx
import { useTyping } from '@ably/chat/react';

const MyComponent = () => {
  const { start, stop, currentlyTyping, error } = useTyping({
    listener: (typingEvent: TypingEvent) => {
      console.log('Typing event received: ', typingEvent);
    },
  });

  const handleStartClick = () => {
    // calling starts a timer that will automatically call stop() after a pre defined time
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

## usePresence

This hook allows you to control your presence status in a `Room`.

**To use this hook, the component calling it must be a child of a `ChatRoomProvider`.**

When mounting, the hook will automatically `enter` the user into presence, with the data provided to the hook, and then `leave` presence when the component unmounts.

The `update` function is also exposed by the hook, allowing you to send updates to the presence state.

An optional parameter can be passed to the hook to set the presence data to enter and leave with.

The hook will also provide the `Presence` instance, should you wish to interact with it directly.

_**NOTE: To subscribe to presence events, you can use the `usePresenceListener` hook.**_

```tsx
import React from 'react';
import { usePresence } from '@ably/chat/react';

const MyComponent = () => {
  const { leave, update, isPresent } = usePresence({
    dataToEnterWith: { status: 'Online' },
    dataToLeaveWith: { status: 'Offline' },
  });

  const updatePresence = () => {
    update({ status: 'Away' });
  };

  return (
    <div>
      <div>Presence status: {isPresent ? 'Online' : 'Offline'}</div>
      <button onClick={updatePresence}>Set Away</button>
    </div>
  );
};
```

## usePresenceListener

This hook accepts a listener callback for receiving presence events and provides a state variable kept up to date
with the current presence state.

It is intended solely for monitoring the state of `Presence` in a room, should you wish to enter presence and thus
update the presence state, you should use the `usePresence` hook.

This hook also allows you to access the `Presence` instance of a specific `room` from the nearest `ChatRoomProvider` in
the component tree.

**To use this hook, the component calling it must be a child of a `ChatRoomProvider`.**

```tsx
import React from 'react';
import { usePresenceListener } from '@ably/chat/react';

const MyComponent = () => {
  const { presenceData, error } = usePresenceListener({
    listener: (event) => {
      console.log('Presence event: ', event);
    },
  });

  return (
    <div>
      <p>Presence data:</p>
      {error === undefined ? (
        <ul>
          {presenceData.map((presence) => (
            <li key={presence.clientId}>{presence.clientId}</li>
          ))}
        </ul>
      ) : (
        <p>Error loading presence data</p>
      )}
    </div>
  );
};
```
