import { FC } from 'react';
import { ChatClient as ChatSdk } from '@ably/chat';
import { RoomProvider } from './containers/RoomContext';
import { Chat } from './containers/Chat';
import { OccupancyComponent } from './components/OccupancyComponent';
import { UserPresenceComponent } from './components/UserPresenceComponent';

// We read the roomID from the URL query string and default to 'abcd' if none
// provided. We make sure the URL is updated to always include the roomId. This
// is useful for sharing a link to a specific room or for testing with multiple
// rooms.
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
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <UserPresenceComponent clientId={client.clientId} />
        <OccupancyComponent />
      </div>
    </div>
  </RoomProvider>
);
export default App;
