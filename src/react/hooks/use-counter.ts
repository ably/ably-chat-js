import { Message } from '@ably/chat';
import { useState } from 'react';

/**
 * The return type of the custom hook.
 */
export interface TestHookReturnType {
  /**
   * The current count.
   */
  count: number;

  /**
   * Increments the count.
   * @returns void
   */
  increment: () => void;

  /**
   * Decrements the count.
   * @returns void
   */
  decrement: () => void;
}

/**
 * A custom hook to manage a counter.
 * @returns TestHookReturnType The return type of the custom hook.
 */
export const useCounter = (): TestHookReturnType => {
  const foo: Message = {
    timeserial: '1',
    text: 'Hello, world',
    clientId: '1',
    roomId: '1',
    createdAt: new Date(),
    metadata: {},
    headers: {},
    /* v8 ignore next */
    before() {
      return false;
    },
    /* v8 ignore next */
    after() {
      return false;
    },
    /* v8 ignore next */
    equal() {
      return false;
    },
  };
  foo.text;

  const [count, setCount] = useState(0);
  const increment = () => {
    setCount(count + 1);
  };
  const decrement = () => {
    setCount(count - 1);
  };

  return { count, increment, decrement };
};
