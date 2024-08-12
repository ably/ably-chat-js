import { ChatStatusResponse } from '../chat-status-response.js';
import { DiscontinuityListener, Message, MessageListener, Messages, PaginatedResult, QueryOptions } from '@ably/chat';
import { Listenable } from '../listenable.js';
import { StatusParams } from '../status-params.js';
import { useRoom } from './use-room.js';
import { useCallback, useEffect, useState } from 'react';

interface UseMessagesResponse /* extends ChatStatusResponse */ {
  readonly send: Messages['send'];
  readonly get: Messages['get'];
  readonly messages: Messages;
  readonly previousMessages?: Promise<PaginatedResult<Message>>;
}

interface UseMessagesParams extends StatusParams, Listenable<MessageListener> {
  /**
   * Set this to fetch previous messages after setting up a listener. The
   * fetched messages will be available in the `previousMessages` promise.
   */
  previousMessagesParams?: Omit<QueryOptions, 'direction'>;
}

const useMessages = (params?: UseMessagesParams): UseMessagesResponse => {

  const { room } = useRoom();
  const messages = room.messages;
  const send = useCallback(messages.send.bind(messages), [ messages ]);
  const get = useCallback(messages.get.bind(messages), [ messages ]);

  const [ previousMessages, setPreviousMessages ] = useState<Promise<PaginatedResult<Message>> | undefined>(undefined);

  useEffect(() => {
    if (params?.listener) {
      const sub = messages.subscribe(params?.listener);
      if (params?.previousMessagesParams) {
        setPreviousMessages(sub.getPreviousMessages(params.previousMessagesParams));
      }
      return () => {
        sub.unsubscribe();
        setPreviousMessages(undefined);
      };
    }
  }, [ messages, params?.listener, params?.previousMessagesParams ]);

  useEffect(() => {
    if (params?.onDiscontinuity) {
      const subscriber = messages.onDiscontinuity(params.onDiscontinuity);
      return subscriber.off;
    }
  }, [ messages, params?.onDiscontinuity ]);

  return {
    send,
    get,
    messages,
    previousMessages,
  };
};
