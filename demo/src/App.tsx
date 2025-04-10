import { FC, useEffect, useState } from 'react';
import { Chat } from './containers/Chat';
import { OccupancyComponent } from './components/OccupancyComponent';
import { UserPresenceComponent } from './components/UserPresenceComponent';
import { ChatRoomProvider } from '@ably/chat';

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
    history.pushState(null, '', '?' + params.toString());
    setRoomId(newRoomId);
  };

  // Add a useEffect that handles the popstate event to update the roomId when
  // the user navigates back and forth in the browser history.
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const newRoomId = params.get('room') || 'abcd';
      setRoomId(newRoomId);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  return (
    <ChatRoomProvider
      id={roomIdState}
      release={true}
      attach={true}
      options={{ occupancy: { enableOccupancyEvents: true } }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', width: '800px', margin: 'auto', height: '650px' }}
      >
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
