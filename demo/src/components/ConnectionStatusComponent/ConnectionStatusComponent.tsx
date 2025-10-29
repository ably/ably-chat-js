import React, { useState, KeyboardEvent, ChangeEvent } from 'react';
import { ConnectionStatus } from '@ably/chat';
import { useChatConnection, useChatClient } from '@ably/chat/react';

const STATUS_MAP: Record<string, { text: string; color: string }> = {
  [ConnectionStatus.Connecting]: { text: 'Connecting...', color: 'text-blue-500' },
  [ConnectionStatus.Disconnected]: {
    text: 'Disconnected - will retry to connect automatically',
    color: 'text-yellow-800',
  },
  [ConnectionStatus.Suspended]: {
    text: 'Connection suspended - will retry to connect automatically',
    color: 'text-yellow-800',
  },
  [ConnectionStatus.Failed]: { text: 'Connection failed. Refresh the page to try again.', color: 'text-red-800' },
  [ConnectionStatus.Connected]: { text: 'Connected', color: 'text-green-800' },
  [ConnectionStatus.Closing]: { text: 'Closing connection...', color: 'text-orange-600' },
  [ConnectionStatus.Closed]: { text: 'Connection closed. Refresh the page to reconnect.', color: 'text-gray-800' },
};

export const ConnectionStatusComponent: React.FC = () => {
  const { currentStatus } = useChatConnection();
  const { clientId } = useChatClient();
  const [editableClientId, setEditableClientId] = useState(clientId);

  const handleClientIdChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEditableClientId(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      changeClientId();
    }
  };

  /**
   * In a real app, changing the logged in user typically means navigating to
   * some sort of login page and then navigating back to the main app.
   *
   * There is no real login here. We just have to specify a clientId in the
   * request that we sent to get a valid token from our function at
   * demo/api/ably-token-request. This happens when the demo app loads the
   * first time and periodically to refresh the token (handled by ably-js).
   *
   * See demo/src/main.tsx to see how the clientId is initially set (random
   * and saved in sessionStorage for consistency between page refreshes). This
   * function sets the given clientId in sessionStorage and refreshes the page,
   * meaning the new clientId will be read and set on page load.
   *
   * In a live app if you need to re-authenticate with another clientId you
   * will need to stop everything including the Ably Pubsub Client and restart
   * with the new clientId. Neither libraries support changing the clientId
   * witohut reconnecting. Typically changing user is achieved by navigating to
   * a login page and back, unless the login page is part of the same single-
   * page app as the chat.
   *
   * Ably and Ably Chat also offer a feature called Presence where user profile
   * data can be attached (things like avatar URLs or display names). Editing a
   * profile through Presence is possible without dropping the connection and
   * it does not change the clientId. Read more about Presence in chat:
   * {@link https://ably.com/docs/chat/rooms/presence}.
   */
  const changeClientId = () => {
    if (!editableClientId) {
      return;
    }
    sessionStorage.setItem('ably-chat-demo-clientId', editableClientId);
    window.location.reload();
  };

  const statusInfo = STATUS_MAP[currentStatus];

  if (!statusInfo) return null;

  return (
    <div className="p-4 text-left h-full border border-gray-300 bg-gray-100 rounded shadow-sm">
      <h2 className="text-lg text-center font-semibold text-blue-500 pb-2 border-b border-gray-200">
        Connection Status
      </h2>
      <div className="mt-3 text-black">
        <div className="flex items-baseline mb-1">
          <span className="w-20">Status:</span>
          <span className={statusInfo.color}>{statusInfo.text}</span>
        </div>
        <div className="flex items-center">
          <span className="w-20">Client ID:</span>
          <input
            type="text"
            value={editableClientId}
            onChange={handleClientIdChange}
            onKeyDown={handleKeyDown}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:border-blue-300 transition-colors"
            placeholder="Enter client ID"
          />
        </div>
      </div>
    </div>
  );
};
