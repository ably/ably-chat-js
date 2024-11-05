import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Ably from 'ably';
import { ChatClient, LogLevel } from '@ably/chat';
import { nanoid } from 'nanoid';
import App from './App.tsx';
import './index.css';
import { ChatClientProvider } from '@ably/chat/react';
import { AblyProvider } from 'ably/react';

// Generate a random clientId and remember it for the length of the session, so
// if refreshing the page you still see your own messages as yours.
//
// This also allows users to change their clientId by setting the
// sessionStorage key and we use this in `setClientId()` (see Chat.tsx).
const clientId = (function () {
  const knownClientId = sessionStorage.getItem('ably-chat-demo-clientId');
  if (knownClientId) {
    return knownClientId;
  }
  const newClientId = nanoid();
  sessionStorage.setItem('ably-chat-demo-clientId', newClientId);
  return newClientId;
})();

// use this for local development with local realtime
//
const realtimeClient = new Ably.Realtime({
  authUrl: `/api/ably-token-request?clientId=${clientId}`,
  port: 8081,
  environment: 'local',
  tls: false,
  clientId,
});

// const realtimeClient = new Ably.Realtime({
//   authUrl: `/api/ably-token-request?clientId=${clientId}`,
//   restHost: import.meta?.env?.VITE_ABLY_HOST ? import.meta.env.VITE_ABLY_HOST : undefined,
//   realtimeHost: import.meta?.env?.VITE_ABLY_HOST ? import.meta.env.VITE_ABLY_HOST : undefined,
//   clientId,
// });

const chatClient = new ChatClient(realtimeClient, { logLevel: LogLevel.Info });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AblyProvider client={realtimeClient}>
      <ChatClientProvider client={chatClient}>
        <App />
      </ChatClientProvider>
    </AblyProvider>
  </React.StrictMode>,
);
