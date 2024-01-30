import React from 'react';
import ReactDOM from 'react-dom/client';
import { Realtime } from 'ably/promises';
import { Chat } from '@ably-labs/chat';
import { nanoid } from 'nanoid';
import App from './App.tsx';
import './index.css';

const clientId = nanoid();

const ablyClient = new Realtime({
  authUrl: `/api/ably-token-request?clientId=${clientId}`,
  restHost: import.meta.env.VITE_ABLY_HOST,
  realtimeHost: import.meta.env.VITE_ABLY_HOST,
  clientId,
});

const chatClient = new Chat(ablyClient);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App client={chatClient} />
  </React.StrictMode>,
);
