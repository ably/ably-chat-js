import React from 'react';
import { useChatConnection } from '@ably/chat/react';
import { ConnectionStatus } from '@ably/chat';

export const ConnectionStatusComponent: React.FC = () => {
  const { currentStatus } = useChatConnection();

  switch (currentStatus) {
    case ConnectionStatus.Connecting: {
      return (
        <div
          className="text-blue-800 bg-blue-50"
          style={{ position: 'fixed', top: '0', padding: '3px' }}
        >
          Connecting...
        </div>
      );
    }
    case ConnectionStatus.Disconnected: {
      return (
        <div
          className="text-yellow-800 bg-yellow-50"
          style={{ position: 'fixed', top: '0', padding: '3px' }}
        >
          Disconnected - will retry to connect automatically
        </div>
      );
    }
    case ConnectionStatus.Suspended: {
      return (
        <div
          className="text-yellow-800 bg-yellow-50"
          style={{ position: 'fixed', top: '0', padding: '3px' }}
        >
          Connection suspended - will retry to connect automatically
        </div>
      );
    }
    case ConnectionStatus.Failed: {
      return (
        <div
          className="text-red-800 bg-red-50"
          style={{ position: 'fixed', top: '0', padding: '3px' }}
        >
          Connection failed. Refresh the page to try again.
        </div>
      );
    }
  }

  // initialized and connected are not shown since they are
  // not warnings for the user
  return <></>;
};
