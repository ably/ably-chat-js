import { FC, useEffect, useState } from 'react';
import { ChatRoomProvider } from '@ably/chat/react';
import { ReactionTypeProvider } from './containers/ReactionTypeProvider';
import './App.css';
import { ConnectionStatusComponent } from './components/ConnectionStatusComponent';
import { RoomStatusComponent } from './components/RoomStatusComponent';
import { OccupancyComponent } from './components/OccupancyComponent';
import { UserPresenceComponent } from './components/UserPresenceComponent';
import { ReactionComponent } from './components/ReactionComponent';
import { ChatWindow } from 'ably-chat-react-ui-components';

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
        <div className="flex flex-col h-screen w-svh mx-auto border border-blue-500 rounded-lg overflow-hidden font-sans bg-gray-50">
          <div className="flex w-full border-b border-blue-300 p-2 bg-white">
            <div className="flex-1 pr-2">
              <ConnectionStatusComponent />
            </div>
            <div className="flex-1 pl-2">
              <RoomStatusComponent updateRoomId={updateRoomId} />
            </div>
          </div>
          <div className="flex flex-1 p-2 gap-2 overflow-hidden">
            <div className="flex flex-col w-1/2 border border-blue-300 rounded-lg bg-white overflow-hidden">
              <div className="flex-1 overflow-y-auto p-2">
                <OccupancyComponent />
                <UserPresenceComponent />
              </div>
              <div className="h-[100px] border-t border-blue-300 p-2">
                <ReactionComponent />
              </div>
            </div>
            <div className="flex flex-col w-1/2 border border-blue-300 rounded-lg bg-white overflow-hidden">
              <div className="flex-1 overflow-y-auto p-2">
                <ChatWindow />
              </div>
            </div>
          </div>
        </div>
      </ChatRoomProvider>
    </ReactionTypeProvider>
  );
};
export default App;
