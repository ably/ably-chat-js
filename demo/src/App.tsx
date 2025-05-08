import { FC, useEffect, useState } from 'react';
import { ChatRoomProvider } from '@ably/chat/react';
import { ReactionTypeProvider } from './containers/ReactionTypeProvider';
import { UserPresenceComponent } from './components/UserPresenceComponent';
import './App.css';
import { ConnectionStatusComponent } from './components/ConnectionStatusComponent';
import { RoomStatusComponent } from './components/RoomStatusComponent';
import { ChatBoxComponent } from './components/ChatBoxComponent';
import { ReactionComponent } from './components/ReactionComponent';
import { OccupancyComponent } from './components/OccupancyComponent';

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
  }, [setRoomId]);

  return (
    <ReactionTypeProvider>
      <ChatRoomProvider
        id={roomIdState} // The room ID you want to create or join
        release={true} // Release the room automatically when unmounted
        attach={true} // Attach to the room automatically when mounted
        options={{ occupancy: { enableEvents: true } }} // Enable occupancy events
      >
        <div className="flex flex-col w-[900px] h-full border-1 border-blue-500 rounded-lg overflow-hidden mx-auto font-sans">
          <div className="flex flex-row w-full border-1 border-blue-500 rounded-lg overflow-hidden mx-auto font-sans">
            <div className="flex-1 border-1 border-blue-500">
              <ConnectionStatusComponent />
            </div>
            <div className="flex-1 border-1 border-blue-500">
              <RoomStatusComponent updateRoomId={updateRoomId} />
            </div>
          </div>

          <div className="flex flex-1 flex-row justify-evenly">
            <div className="flex flex-col w-1/2 border-1 border-blue-500 rounded-lg overflow-hidden mx-auto font-sans">
              <div className="flex-1 border-1 border-blue-500 overflow-y-auto">
                <div className="flex flex-col bg-white w-full h-full px-4 py-2">
                  <OccupancyComponent />
                  <UserPresenceComponent />
                </div>
              </div>
              <div className="flex-1 border-1 min-h-[100px] max-h-[100px] border-blue-500">
                <ReactionComponent />
              </div>
            </div>
            <div className="flex flex-col bg-white w-1/2 border-1 border-blue-500 rounded-lg overflow-hidden mx-auto font-sans">
              <ChatBoxComponent />
            </div>
          </div>
        </div>
      </ChatRoomProvider>
    </ReactionTypeProvider>
  );
};
export default App;
