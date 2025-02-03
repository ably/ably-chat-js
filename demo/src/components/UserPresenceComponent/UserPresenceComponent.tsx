import { FC, useState } from 'react';
import '../../../styles/global.css';
import './UserPresenceComponent.css';
import {
  ConnectionStatus,
  OnlineMember,
  useChatClient,
  useChatConnection,
  useOnlineStatus,
  useOnlineStatusListener,
} from '@ably/chat';

interface UserListComponentProps {}

export const UserPresenceComponent: FC<UserListComponentProps> = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const { setOnlineStatus, isOnline, error } = useOnlineStatus({ onlineWithData: { status: '💻 Online' } });
  const { onlineMembers } = useOnlineStatusListener({
    listener: (event: unknown) => {
      console.log('Presence data changed', { event });
    },
  });

  const clientId = useChatClient().clientId;
  const { currentStatus } = useChatConnection();
  const isConnected = currentStatus === ConnectionStatus.Connected;

  const [isAway, setIsAway] = useState(true);

  const handleUpdateButtonClick = () => {
    setIsAway(!isAway);
    setOnlineStatus({ status: isAway ? '🔄 Away' : '💻 Online' }).catch((error: unknown) => {
      console.error('Error updating presence:', error);
    });
  };

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  const renderOnlineMember = (onlineMember: OnlineMember, index: number) => {
    const { status } = onlineMember.data as { status: string };
    if (onlineMember.clientId === clientId) {
      return <li key={index}>{`👤 You - ${status}`}</li>;
    }
    return <li key={index}>{`${onlineMember.clientId} - ${status}`}</li>;
  };

  return (
    <div className="user-presence-wrapper">
      <button
        onClick={togglePanel}
        className="btn toggle-panel"
        style={{ position: 'absolute', right: '0', top: '0' }}
      >
        {isPanelOpen ? 'Hide Panel' : 'Show Panel'}
      </button>
      {isPanelOpen && (
        <div className="user-presence-container">
          {error ? (
            <div className="error-message">
              <p>Error: {error.message}</p>
            </div>
          ) : (
            <>
              <div className="user-list">
                <h2>Present Users</h2>
                <ul>{onlineMembers.map(renderOnlineMember)}</ul>
              </div>
              <div className="actions">
                <button
                  onClick={handleUpdateButtonClick}
                  disabled={!isConnected || !isOnline}
                  className="btn update disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {isOnline ? '🔄 Appear Away' : '💻 Appear Online'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
