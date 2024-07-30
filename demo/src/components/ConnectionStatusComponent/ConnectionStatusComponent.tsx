import React from 'react';
import { useChatConnection } from '@ably/chat/react';
import { ConnectionLifecycle } from '@ably/chat';

export const ConnectionStatusComponent: React.FC = () => {
  const { currentStatus } = useChatConnection();

  switch (currentStatus) {
    case ConnectionLifecycle.Connecting: {
      return <div className="text-blue-800 bg-blue-50">Connecting...</div>;
    }
    case ConnectionLifecycle.Disconnected: {
      return <div className="text-yellow-800 bg-yellow-50">Disconnected - will retry to connect automatically</div>;
    }
    case ConnectionLifecycle.Suspended: {
      return (
        <div className="text-yellow-800 bg-yellow-50">Connection suspended - will retry to connect automatically</div>
      );
    }
    case ConnectionLifecycle.Failed: {
      return <div className="text-red-800 bg-red-50">Connection failed. Refresh the page to try again.</div>;
    }
  }

  // initialized and connected are not shown since they are
  // not warnings for the user
  return <></>;
};
