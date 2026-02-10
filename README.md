
![Ably Chat Header](images/JavaScriptChatSDK-github.png)
[![npm version](https://img.shields.io/npm/v/@ably/chat.svg?style=flat)](https://www.npmjs.com/package/@ably/chat)
[![License](https://img.shields.io/github/license/ably/ably-chat-js.svg)](https://github.com/ably/ably-chat-js/blob/main/LICENSE)


# Ably Chat JavaScript, TypeScript and React SDK

Ably Chat is a set of purpose-built APIs for a host of chat features enabling you to create 1:1, 1:Many, Many:1 and Many:Many chat rooms for any scale. It is designed to meet a wide range of chat use cases, such as livestreams, in-game communication, customer support, or social interactions in SaaS products. Built on [Ably's](https://ably.com/) core service, it abstracts complex details to enable efficient chat architectures.

---

## Getting started

Everything you need to get started with Ably:

* [About Ably Chat.](https://ably.com/docs/chat)
* [Getting started with Ably Chat in JavaScript.](https://ably.com/docs/chat/getting-started/javascript)
* [Getting started with Ably Chat in React.](https://ably.com/docs/chat/getting-started/react)
* [Getting started with Ably Chat React UI kit.](https://ably.com/docs/chat/getting-started/react-ui-kit)
* [SDK and usage docs in JavaScript.](https://ably.com/docs/chat/setup?lang=javascript)
* [SDK and usage docs in React.](https://ably.com/docs/chat/setup?lang=react)
* [SDK and usage docs for React UI kit.](https://ably.com/docs/chat/react-ui-kit/setup)
* [API documentation (JavaScript).](https://sdk.ably.com/builds/ably/ably-chat-js/main/typedoc/modules/chat-js.html)
* [API documentation (React Hooks).](https://sdk.ably.com/builds/ably/ably-chat-js/main/typedoc/modules/chat-react.html)
* [API documentation (React UI kit).](https://sdk.ably.com/builds/ably/ably-chat-react-ui-kit/main/storybook/)
* [Chat Example App.](https://github.com/ably/ably-chat-js/tree/main/demo)
* [Chat Example App using Ably Chat React UI kit.](https://github.com/ably/ably-chat-react-ui-kit/tree/main/examples/group-chat)
* Play with the [livestream chat demo.](https://ably-livestream-chat-demo.vercel.app/)

---

## Supported platforms

Ably aims to support a wide range of platforms. If you experience any compatibility issues, open an issue in the repository or contact [Ably support](https://ably.com/support).

This SDK supports the following platforms:

| Platform     | Support |
|--------------|---------|
| Browsers     | All major desktop and mobile browsers, including Chrome, Firefox, Edge, Safari (iOS/macOS), Opera, and Android. Internet Explorer is not supported. |
| Node.js      | Version 20 or newer. |
| TypeScript   | Fully supported, the library is written in TypeScript. |
| React        | Includes providers and hooks for deep integration with the React ecosystem. |
| React Native | All React Native platforms. Issues can be reported or support requested. |
| Android      | Supported via the [Ably Chat Kotlin SDK.](https://github.com/ably/ably-chat-kotlin) |
| iOS          | Supported via the [Ably Chat Swift SDK.](https://github.com/ably/ably-chat-swift) |

---

## Installation

The Chat SDK is built on top of the Ably Pub/Sub SDK and uses that to establish a connection with Ably.

### JavaScript/React

Install the Pub/Sub SDK and the Chat SDK:

```sh
npm install ably @ably/chat
```

---

## Usage

### JavaScript / TypeScript

The following code connects to Ably's chat service, subscribes to a chat room, and sends a message to that room:

```typescript
import * as Ably from 'ably';
import { ChatClient, RoomStatus, RoomStatusChange } from '@ably/chat';

// Initialize Ably Realtime client
// Note: For client-side applications, token authentication is recommended.
// See: https://ably.com/docs/auth
const realtimeClient = new Ably.Realtime({
  key: '<your-ably-api-key>',
  clientId: 'your-client-id',
});

// Create a chat client
const chatClient = new ChatClient(realtimeClient);

// Get a chat room
const room = await chatClient.rooms.get('my-room');

// Monitor room status
room.onStatusChange((statusChange: RoomStatusChange) => {
  switch (statusChange.current) {
    case RoomStatus.Attached:
      console.log('Room is attached');
      break;
    case RoomStatus.Detached:
      console.log('Room is detached');
      break;
    case RoomStatus.Failed:
      console.log('Room failed:', statusChange.error);
      break;
    default:
      console.log('Room status:', statusChange.current);
  }
});

// Subscribe to messages
const subscription = room.messages.subscribe((event) => {
  console.log('Received message:', event.message.text);
});

// Attach to the room
await room.attach();

// Send a message
await room.messages.send({ text: 'Hello, World!' });
```

### React

For React applications, the SDK provides hooks and providers for seamless integration:

```tsx
import * as Ably from 'ably';
import { ChatClient } from '@ably/chat';
import { ChatClientProvider, ChatRoomProvider, useMessages } from '@ably/chat/react';

// Initialize clients
// Note: For client-side applications, token authentication is recommended.
// See: https://ably.com/docs/auth
const realtimeClient = new Ably.Realtime({
  key: '<your-ably-api-key>',
  clientId: 'your-client-id',
});
const chatClient = new ChatClient(realtimeClient);

// Wrap your app with providers
function App() {
  return (
    <ChatClientProvider client={chatClient}>
      <ChatRoomProvider name="my-room">
        <ChatComponent />
      </ChatRoomProvider>
    </ChatClientProvider>
  );
}

// Use hooks to interact with chat
function ChatComponent() {
  const { sendMessage } = useMessages({
    listener: (event) => {
      console.log('Received message:', event.message.text);
    },
  });

  const handleSend = async () => {
    await sendMessage({ text: 'Hello, World!' });
  };

  return <button onClick={handleSend}>Send Message</button>;
}
```

---

## Releases

The [CHANGELOG.md](/ably/ably-chat-js/blob/main/CHANGELOG.md) contains details of the latest releases for this SDK. You can also view all Ably releases on [changelog.ably.com](https://changelog.ably.com).

---

## Contribute

Read the [CONTRIBUTING.md](./CONTRIBUTING.md) guidelines to contribute to Ably or [Share feedback or request](https://forms.gle/mBw9M53NYuCBLFpMA) a new feature.

---

## Support, feedback, and troubleshooting

For help or technical support, visit Ably's [support page](https://ably.com/support). You can also view the [community reported Github issues](https://github.com/ably/ably-chat-js/issues) or raise one yourself.
