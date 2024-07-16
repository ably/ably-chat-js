import { FC } from 'react';
import { ChatClient as ChatSdk } from '@ably/chat';
import { RoomProvider } from './containers/RoomContext';
import { Chat } from './containers/Chat';
import { UserPresenceComponent } from './components/UserPresenceComponent';

let roomId: string;
(function () {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('room')) {
    roomId = 'abcd';
    params.set('room', roomId);
    history.replaceState(null, '', '?' + params.toString());
  } else {
    roomId = params.get('room')!;
  }
})();

interface AppProps {
  client: ChatSdk;
}

const App: FC<AppProps> = ({ client }) => (
  <RoomProvider
    client={client}
    roomId={roomId}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', width: '800px' }}>
      <Chat />
      <UserPresenceComponent clientId={client.clientId} />
    </div>
  </RoomProvider>
);
export default App;
