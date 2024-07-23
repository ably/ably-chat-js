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
