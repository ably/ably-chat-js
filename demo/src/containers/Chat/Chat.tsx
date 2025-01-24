import { useEffect, useState } from 'react';
import { MessageInput } from '../../components/MessageInput';
import { ConnectionStatus } from '@ably/chat';
import { useChatClient, useChatConnection } from '@ably/chat-react';
import { ConnectionStatusComponent } from '../../components/ConnectionStatusComponent';
import { TypingIndicatorPanel } from '../../components/TypingIndicatorPanel';
import { ChatBoxComponent } from '../../components/ChatBoxComponent';
import { ReactionComponent } from '../../components/ReactionComponent';

export const Chat = (props: { roomId: string; setRoomId: (roomId: string) => void }) => {
  const chatClient = useChatClient();
  const clientId = chatClient.clientId;
  const [isConnected, setIsConnected] = useState(false);
  const { currentStatus } = useChatConnection();

  useEffect(() => {
    setIsConnected(currentStatus === ConnectionStatus.Connected);
  }, [currentStatus]);
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
  function changeClientId() {
    const newClientId = prompt('Enter your new clientId');
    if (!newClientId) {
      return;
    }
    sessionStorage.setItem('ably-chat-demo-clientId', newClientId);
    window.location.reload();
  }

  function changeRoomId() {
    const newRoomId = prompt('Enter your new roomId');
    if (!newRoomId) {
      return;
    }
    props.setRoomId(newRoomId);
  }

  return (
    <div>
      {!isConnected && <div className="text-center m-auto">loading...</div>}
      {isConnected && (
        <div className="flex-1 p:2 sm:p-12 justify-between flex flex-col h-full">
          <ConnectionStatusComponent />
          <div
            className="text-xs p-3"
            style={{ backgroundColor: '#333' }}
          >
            You are <strong>{clientId}</strong>.{' '}
            <a
              href="#"
              className="text-blue-600 dark:text-blue-500 hover:underline"
              onClick={changeClientId}
            >
              Change clientId
            </a>
            .
          </div>
          <div
            className="text-xs p-3"
            style={{ backgroundColor: '#333' }}
          >
            You are in room <strong>{props.roomId}</strong>.{' '}
            <a
              href="#"
              className="text-blue-600 dark:text-blue-500 hover:underline"
              onClick={changeRoomId}
            >
              Change roomId
            </a>
            .
          </div>
          <ChatBoxComponent />
          <TypingIndicatorPanel />
          <MessageInput />
          <ReactionComponent />
        </div>
      )}
    </div>
  );
};
