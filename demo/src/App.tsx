import { FC, useState } from 'react';
import { Chat } from './containers/Chat';
import { OccupancyComponent } from './components/OccupancyComponent';
import { UserPresenceComponent } from './components/UserPresenceComponent';
import { ChatRoomProvider } from '@ably/chat/react';
import { RoomOptionsDefaults } from '@ably/chat';

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

interface AppProps {}

const App: FC<AppProps> = () => {
  const [roomIdState, setRoomId] = useState(roomId);
  const updateRoomId = (newRoomId: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set('room', newRoomId);
    history.replaceState(null, '', '?' + params.toString());
    setRoomId(newRoomId);
  };

  return (
    <ChatRoomProvider
      id={roomIdState}
      release={true}
      attach={true}
      options={RoomOptionsDefaults}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '800px', margin: 'auto' }}>
        <Chat
          setRoomId={updateRoomId}
          roomId={roomIdState}
        />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <UserPresenceComponent />
          <OccupancyComponent />
        </div>
      </div>
    </ChatRoomProvider>
  );
};
export default App;
