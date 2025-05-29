# Ably Chat JavaScript, TypeScript and React SDK

![Ably Chat Header](/images/ably-chat-github-header.png)

Ably Chat is a set of purpose-built APIs for a host of chat features enabling you to create 1:1, 1:Many, Many:1 and Many:Many chat rooms for any scale. It is designed to meet a wide range of chat use cases, such as livestreams, in-game communication, customer support, or social interactions in SaaS products. Built on [Ably's](https://ably.com/) core service, it abstracts complex details to enable efficient chat architectures.

---

## Getting started

Everything you need to get started with Ably:

* [Getting started with Ably Chat in JavaScript](https://ably.com/docs/chat/getting-started/javascript)
* [Getting started with Ably Chat in React](https://ably.com/docs/chat/getting-started/react)
* Play with the [livestream chat demo](https://ably-livestream-chat-demo.vercel.app/).

---

## Supported Platforms

Ably aims to support a wide range of platforms. If you experience any compatibility issues, open an issue in the repository or contact [Ably support](https://ably.com/support).

This SDK supports the following platforms:

| Platform     | Support |
|--------------|---------|
| Browsers     | All major desktop and mobile browsers, including Chrome, Firefox, Edge, Safari (iOS/macOS), Opera, and Android. Internet Explorer is not supported. |
| Node.js      | Version 18 or newer. |
| TypeScript   | Fully supported, the library is written in TypeScript. |
| React        | Includes providers and hooks for deep integration with the React ecosystem. |
| React Native | All React Native platforms. Issues can be reported or support requested. |
| Android      | Supported via the [Kotlin](https://github.com/ably/ably-chat-kotlin). |
| iOS          | Supported via the [Swift](https://github.com/ably/ably-chat-swift) SDK. |

> [!IMPORTANT]
> SDK versions <  1.2.36 will be [deprecated](https://ably.com/docs/platform/deprecate/protocol-v1) from November 1, 2025.

> [!NOTE]
> The Chat SDK can be installed either from NPM, or included directly from Ably's CDN. Note that you also need to install the core Ably SDK.

---

## Prerequisites

You will need the following prerequisites:

- An Ably account
  - You can [sign up](https://ably.com/signup) to the generous free tier.
- An Ably API key
  - Use the default or create a new API key in an app within
    your [Ably account dashboard](https://ably.com/dashboard).
  - Make sure your API key has the
    following [capabilities](https://ably.com/docs/auth/capabilities): `publish`, `subscribe`, `presence`, `history`, `channel-metadata`, `message-update-own` and `message-delete-own`.

## Installation

The Chat SDK can be installed either from NPM, or included directly from Ably's CDN. Note that you also need to install the core Ably SDK.

### npm

```sh
npm install ably @ably/chat
```

### CDN

For browsers, you can also include the Chat SDK directly into your HTML:

```html
<!-- Ably Chat also requires the core Ably SDK to be available -->
<script src="https://cdn.ably.com/lib/ably.min-2.js"></script>
<script src="https://cdn.ably.com/lib/ably-chat.umd.cjs-0.js"></script>
<script>
  const realtime = new Ably.Realtime({ key: 'your-ably-key' });
  const chatClient = new AblyChat.ChatClient(realtime);
</script>
```

The Ably client library follows [Semantic Versioning](http://semver.org/). To lock into a major or minor version of the client library, you can specify a specific version number such as https://cdn.ably.com/lib/ably-chat-0.js for all v0._ versions, or https://cdn.ably.com/lib/ably-chat-0.1.js for all v0.1._ versions, or you can lock into a single release with https://cdn.ably.com/lib/ably-chat-0.1.0.js. See https://github.com/ably/ably-chat-js/tags for a list of tagged releases.

## Getting Started

By the end of this guide, you will have initialized the Ably Chat client and sent your first chat message.

### TypeScript

First, make sure you've installed the Chat SDK using the instructions above. Now, create a `.ts` file with the following code. Replace the `<API_KEY>` with your
own key from the Ably dashboard.

```ts
import * as Ably from "ably";
import {
  ChatClient,
  ConnectionStatusChange,
  MessageEvent,
  RoomStatusChange,
} from "@ably/chat";

async function getStartedWithChat() {
  // Create a new Ably Realtime client to connect to Ably with your key
  // Note: in production, you should use tokens for authentication, rather than a key.
  const ablyClient = new Ably.Realtime({
    key: "<API_KEY>",
    clientId: "ably-chat",
  });

  // Create a new Ably Chat client, using the Ably client you created
  // The same client can be re-used for as long as your application is running
  const chatClient = new ChatClient(ablyClient);
  const connectionStatus = chatClient.connection.onStatusChange((change: ConnectionStatusChange) => {
      console.log("Connection state changed to", change.current);
    });

  // Get a room to join, subscribe to messages and then attach to the room
  const room = await chatClient.rooms.get(
    "readme-getting-started",
    { occupancy: { enableEvents: true } }
  );
  const roomStatus = room.onStatusChange(
    (change: RoomStatusChange) => {
      console.log("Room state changed to", change.current);
    }
  );

  const messageSubscription = room.messages.subscribe(
    (event: MessageEvent) => {
      console.log("Received message:", event.message.text);
    }
  );
  await room.attach();

  // Send our message to the room
  await room.messages.send({
    text: "Hello, World! This is my first message with Ably Chat!",
  });

  // After 5 seconds, release the room, remove our subscriptions and close the connection
  setTimeout(async () => {
    await chatClient.rooms.release(room.name);
    messageSubscription.unsubscribe();
    connectionStatus.off();
    roomStatus.off();
    await ablyClient.close();
  }, 5000);
}

getStartedWithChat().catch(console.error);
```

Now, run the file you created using the following command:

```shell
npx ts-node <your-file>.ts
```

You should now see the following in your terminal:

```
Room state changed to attaching
Connection state changed to connected
Room state changed to attached
Received message: Hello, World! This is my first message with Ably Chat!
Room state changed to releasing
Room state changed to released
```

Congratulations! You've just sent your first message using the Ably Chat SDK for TypeScript!

### React

Start by creating a project with your framework of choice. For the purpose of this tutorial, we'll use Vite.

```shell
npm create vite@latest ably-chat-getting-started -- --template react-ts
```

Next, install the Ably Chat SDK using the instructions above.

Create a new file, `Messages.tsx`, with the following content. This component is a very simple message display with an input box.

```tsx
import React, { useState } from 'react';
import { Message, MessageEvent } from '@ably/chat';
import { useMessages } from '@ably/chat/react';

// This is a simple chat component that uses the useMessages hook in Ably Chat to send and receive messages.
export function Messages() {

  // Setup some state for the messages and a listener for chat messages using the useMessages hook
  const [message, setMessage] = useState('My first message with Ably Chat!');
  const [messages, setMessages] = useState<Message[]>([]);
  const { send } = useMessages(
    {
      listener: (event: MessageEvent) => {
        console.log('message', event.message);
        setMessages(prev => [...prev, event.message]);
      }
    }
  );

  // This function takes the message from the input field and sends it to the chat using the send function
  // returned from the useMessages hook
  const handleSend = async () => {
    try {
      await send({ text: message });
      console.log('sent message', message);
      setMessage(''); // Clear input after successful send
    } catch (error) {
      console.error('error sending message', error);
    }
  };

  // This is a very simple UI that displays the messages and a text input for sending messages.
  return (
    <div style={{
      maxWidth: '600px',
      minWidth: '400px',
      margin: '20px auto',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Container for the messages */}
      <div className="messages-container" style={{
        height: '400px',
        overflowY: 'auto',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: '#f8f9fa'
      }}>
        {messages.map((msg, index) => (
          <div
            key={index}
            className="message"
            style={{
              backgroundColor: 'white',
              padding: '10px 15px',
              borderRadius: '12px',
              marginBottom: '8px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              maxWidth: '80%'
            }}
          >
            {/* Display the message timestamp and text */}
            <div style={{ fontSize: '0.8em', color: '#666', marginBottom: '4px' }}>
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
            <div style={{ wordBreak: 'break-word', color: '#333' }}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      <div className="input-container" style={{
        display: 'flex',
        gap: '10px'
      }}>
        {/* Input field for sending messages */}
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '4px',
            border: '1px solid #e0e0e0',
            fontSize: '16px'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        {/* Button for sending messages */}
        <button
          onClick={handleSend}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

Now, update your `App.tsx` (or similar) to initialize the Ably Chat client and render the component you just created. Replace the `<API_KEY>` with your
own key from the Ably dashboard.

```tsx
import * as Ably from 'ably';
import { ChatClient } from '@ably/chat';
import { ChatClientProvider, ChatRoomProvider } from '@ably/chat/react';
import { Messages } from './Messages';

// Initialize an Ably Realtime client, which we'll use to power the chat client
// Note: in production, you should use tokens for authentication, rather than a key.
const ablyClient = new Ably.Realtime({
  clientId: 'ably-chat',
  key: "<API_KEY>"
});

// Create the chat client
const chatClient = new ChatClient(ablyClient);

// This an example App component that uses the chat client to power a chat UI. Your app will likely be
// much different to this.
// The ChatClientProvider provides the chat client to the underlying components and React hooks.
// The ChatRoomProvider provides the chat room to the underlying components and React hooks.
// For now, we're using the default room with some default options.
function App() {
  return (
    <ChatClientProvider client={chatClient}>
      <ChatRoomProvider id="readme-getting-started" options={{ occupancy: { enableEvents: true } }}>
        <div>
          <Messages />
        </div>
      </ChatRoomProvider>
    </ChatClientProvider>
  );
}

export default App;
```

Now, start the development environment:

```shell
npm run dev
```

In your browser, you should see a message display and a pre-filled input box. Click the `Send` button and this will send your message to Ably. If this succeeds, the message will appear in the main display window.

Congratulations! You've just sent your first message using the Ably Chat SDK for React!


## Contributing

For guidance on how to contribute to this project, see the [contributing guidelines](CONTRIBUTING.md).

## Support, feedback and troubleshooting

Please visit http://support.ably.com/ for access to our knowledge base and to ask for any assistance. You can also view the [community reported Github issues](https://github.com/ably/ably-chat-js/issues) or raise one yourself.

To see what has changed in recent versions, see the [changelog](CHANGELOG.md).

## Further reading

- See a [simple chat example](/demo/) in this repo.
- Play with the [livestream chat demo](https://ably-livestream-chat-demo.vercel.app/).
- [Share feedback or request](https://forms.gle/mBw9M53NYuCBLFpMA) a new feature.
