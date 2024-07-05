import { FC } from 'react';
import { ChatClient as ChatSdk } from '@ably-labs/chat';
import { RoomProvider } from './containers/RoomContext';
import { Chat } from './containers/Chat';

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
    <Chat />
  </RoomProvider>
);

export default App;
