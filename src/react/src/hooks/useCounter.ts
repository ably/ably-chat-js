import { Message } from '@ably-labs/chat';
import { useState } from 'react';

// useTest just exports a simple counter
export const useCounter = () => {
  const foo: Message = {
    timeserial: '1',
    text: 'Hello, world',
    clientId: '1',
    roomId: '1',
    createdAt: new Date(),
    metadata: {},
    headers: {},
    before() {
      return false;
    },
    after() {
      return false;
    },
    equal() {
      return false;
    },
  };
  foo.text;

  const [count, setCount] = useState(0);
  const increment = () => setCount(count + 1);
  const decrement = () => setCount(count - 1);

  return { count, increment, decrement };
};
