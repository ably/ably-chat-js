import { FC, useState } from 'react';
import '../../../styles/global.css';
import './UserPresenceComponent.css';
import {
  ConnectionStatus,
  PresenceMember,
  useChatClient,
  useChatConnection,
  usePresence,
  usePresenceListener,
} from '@ably/chat';

interface UserListComponentProps {}

export const UserPresenceComponent: FC<UserListComponentProps> = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const { update, isPresent, error } = usePresence({ enterWithData: { status: '💻 Online' } });
  const { presenceData } = usePresenceListener({
    listener: (event: unknown) => {
      console.log('Presence data changed', { event });
    },
  });

  const clientId = useChatClient().clientId;
  const { currentStatus } = useChatConnection();
  const isConnected = currentStatus === ConnectionStatus.Connected;

  const [isOnline, setIsOnline] = useState(true);

  const handleUpdateButtonClick = () => {
    setIsOnline(!isOnline);
    update({ status: isOnline ? '🔄 Away' : '💻 Online' }).catch((error: unknown) => {
      console.error('Error updating presence:', error);
    });
  };

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  const renderPresentMember = (presentMember: PresenceMember, index: number) => {
    const { status } = presentMember.data as { status: string };
    if (presentMember.clientId === clientId) {
      return <li key={index}>{`👤 You - ${status}`}</li>;
    }
    return <li key={index}>{`${presentMember.clientId} - ${status}`}</li>;
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
                <ul>{presenceData.map(renderPresentMember)}</ul>
              </div>
              <div className="actions">
                <button
                  onClick={handleUpdateButtonClick}
                  disabled={!isConnected || !isPresent}
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
