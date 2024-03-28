import { FC } from 'react';
import { Chat as ChatSdk } from '@ably-labs/chat';
import { RoomProvider } from './containers/RoomContext';
import { Chat } from './containers/Chat';

interface AppProps {
  client: ChatSdk;
}
const App: FC<AppProps> = ({ client }) => (
  <RoomProvider
    client={client}
    roomId="abcd"
  >
    <Chat />
  </RoomProvider>
);

export default App;
