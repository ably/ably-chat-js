import { FC, useCallback, useState } from 'react';
import { usePresence } from '../../hooks/usePresence';
import '../../../styles/global.css';
import './UserPresenceComponent.css';
import { PresenceMember } from '@ably/chat';
import { useChatClient } from '@ably/chat/react';

interface UserListComponentProps {}

export const UserPresenceComponent: FC<UserListComponentProps> = () => {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const { loading, presenceMembers, enterPresence, updatePresence, leavePresence } = usePresence();
  const clientId = useChatClient().clientId;

  const onEnterPresence = useCallback(() => {
    enterPresence({ status: 'online' })
      .then(() => console.log('Entered presence'))
      .catch((error) => console.error('Error entering presence', error));
  }, [enterPresence]);

  const onUpdatePresence = useCallback(() => {
    updatePresence({ status: 'away' })
      .then(() => console.log('Updated presence'))
      .catch((error) => console.error('Error updating presence', error));
  }, [updatePresence]);

  const onLeavePresence = useCallback(() => {
    leavePresence()
      .then(() => console.log('Left presence'))
      .catch((error) => console.error('Error leaving presence', error));
  }, [leavePresence]);

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  const renderPresentMember = (presentMember: PresenceMember, index: number) => {
    const { status } = presentMember.data as { status: string };
    if (presentMember.clientId === clientId) {
      return <li key={index}>{`${presentMember.clientId} - ${status.toUpperCase()} (YOU)`}</li>;
    }
    return <li key={index}>{`${presentMember.clientId} - ${status.toUpperCase()}`}</li>;
  };

  if (loading) {
    return <div className="loading">loading...</div>;
  }

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
          <div className="user-list">
            <h2>Present Users</h2>
            <ul>{presenceMembers.map(renderPresentMember)}</ul>
          </div>
          <div className="actions">
            <button
              onClick={() => onEnterPresence()}
              className="btn enter"
            >
              👤 Join
            </button>
            <button
              onClick={() => onUpdatePresence()}
              className="btn update"
            >
              🔄 Appear Away
            </button>
            <button
              onClick={() => onLeavePresence()}
              className="btn leave"
            >
              🚪 Leave
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
