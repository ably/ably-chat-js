import * as Ably from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorCode, errorInfoIs } from '../../core/errors.js';
import { PresenceListener, PresenceMember } from '../../core/presence.js';
import { Room } from '../../core/room.js';
import { RoomStatus } from '../../core/room-status.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useEventListenerRef } from './internal/use-event-listener-ref.js';
import { useRoomLogger } from './internal/use-logger.js';
import { useRoomContext } from './internal/use-room-context.js';
import { useRoomStatus } from './internal/use-room-status.js';
import { useChatConnection } from './use-chat-connection.js';

/**
 * The interval between retries when fetching presence data.
 */
const PRESENCE_GET_RETRY_INTERVAL_MS = 1500;

/**
 * The maximum interval between retries when fetching presence data.
 */
const PRESENCE_GET_RETRY_MAX_INTERVAL_MS = 30000;

/**
 * The maximum number of retries when fetching presence data with {@link Presence.get}.
 */
const PRESENCE_GET_MAX_RETRIES = 5;

/**
 * The options for the {@link usePresenceListener} hook.
 */
export interface UsePresenceListenerParams extends StatusParams, Listenable<PresenceListener> {
  /**
   * The listener to be called when the presence state changes.
   * The listener is removed when the component unmounts.
   * @example
   * ```tsx
   * usePresenceListener({
   *   listener: (presenceEvent) => {
   *     console.log('Presence event:', presenceEvent.type, presenceEvent.member.clientId);
   *   }
   * });
   * ```
   */
  listener?: PresenceListener;
}

export interface UsePresenceListenerResponse extends ChatStatusResponse {
  /**
   * The current state of all the presence members, observed as a whole change, and only emitted while presence is not syncing.
   */
  readonly presenceData: PresenceMember[];

  /**
   * The error state of the presence listener.
   * The hook keeps {@link presenceData} up to date asynchronously, so this error state is provided to allow
   * the user to handle errors that may occur when fetching presence data.
   * It will be set if there is an error fetching the initial presence data,
   * or if there is an error when fetching presence data after a presence event.
   * The error will be cleared once a new presence event is received and successfully processed.
   */
  readonly error?: Ably.ErrorInfo;
}

/**
 * React hook that provides real-time presence data for all users in a room.
 *
 * This hook automatically subscribes to presence events and maintains an up-to-date
 * list of all presence members in the room.
 *
 * **Note**:
 * - This hook must be used within a {@link ChatRoomProvider} component tree.
 * - Room must be attached to receive presence updates, typically the {@link ChatRoomProvider} handles this automatically.
 * @param params - Optional parameters for event listeners and room status callbacks
 * @returns A {@link UsePresenceListenerResponse} containing current presence data and error state
 * @throws An {@link Ably.ErrorInfo} with {@link chat-js!ErrorCode.ReactHookMustBeUsedWithinProvider | ReactHookMustBeUsedWithinProvider} When used outside of a {@link ChatRoomProvider}
 * @example Basic usage
 * ```tsx
 * import React from 'react';
 * import { ChatClient, PresenceEvent } from '@ably/chat';
 * import {
 *   ChatClientProvider,
 *   ChatRoomProvider,
 *   usePresenceListener
 * } from '@ably/chat/react';
 *
 * // Component that displays all presence members
 * const PresenceList = () => {
 *   const { presenceData, error } = usePresenceListener({
 *     listener: (presenceEvent: PresenceEvent) => {
 *       console.log(`Presence ${presenceEvent.type}:`, presenceEvent.member);
 *     },
 *   });
 *
 *   if (error) {
 *     return <div>Error: {error.message}</div>;
 *   }
 *
 *   return (
 *     <div>
 *       <p>Total Members: {presenceData.length}</p>
 *       <ul>
 *         {presenceData.map((member) => (
 *           <li key={member.clientId}>👤 {member.clientId}</li>
 *         ))}
 *       </ul>
 *     </div>
 *   );
 * };
 *
 * const chatClient: ChatClient; // existing ChatClient instance
 *
 * // App component with providers
 * const App = () => {
 *   return (
 *     <ChatClientProvider client={chatClient}>
 *       <ChatRoomProvider name="team-room">
 *         <PresenceList />
 *       </ChatRoomProvider>
 *     </ChatClientProvider>
 *   );
 * };
 *
 * export default App;
 * ```
 */
export const usePresenceListener = (params?: UsePresenceListenerParams): UsePresenceListenerResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  const context = useRoomContext('usePresenceListener');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);

  const logger = useRoomLogger();
  logger.trace('usePresenceListener();');

  const receivedEventNumber = useRef(0);
  const triggeredEventNumber = useRef(0);
  const retryTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const numRetries = useRef(0);
  const latestPresentData = useRef<PresenceMember[]>([]);
  const [presenceData, setPresenceData] = useState<PresenceMember[]>([]);
  const errorRef = useRef<Ably.ErrorInfo | undefined>(undefined);

  const [error, setError] = useState<Ably.ErrorInfo | undefined>();

  // create stable references for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  const setErrorState = useCallback(
    (error: Ably.ErrorInfo) => {
      logger.debug('usePresenceListener(); setting error state', { error });
      errorRef.current = error;
      setError(error);
    },
    [logger],
  );

  const clearErrorState = useCallback(() => {
    logger.debug('usePresenceListener(); clearing error state');
    errorRef.current = undefined;
    setError(undefined);
  }, [logger]);

  useEffect(() => {
    // ensure we only process and return the latest presence data.
    const updatePresenceData = () => {
      receivedEventNumber.current += 1;

      // clear the previous retry if we have received a new event
      if (retryTimeout.current) {
        clearTimeout(retryTimeout.current);
        retryTimeout.current = undefined;
        numRetries.current = 0;
      }

      // attempt to get the presence data
      getAndSetState(receivedEventNumber.current);
    };

    const getAndSetState = (eventNumber: number) => {
      wrapRoomPromise(
        context.room,
        (room: Room) => {
          room.presence
            .get({ waitForSync: true })
            .then((presenceMembers) => {
              logger.debug('usePresenceListener(); fetched presence data', { presenceMembers });

              // clear the retry now we have resolved
              if (retryTimeout.current) {
                clearTimeout(retryTimeout.current);
                retryTimeout.current = undefined;
                numRetries.current = 0;
              }

              // ensure the current event is still the latest
              if (triggeredEventNumber.current >= eventNumber) {
                return;
              }

              triggeredEventNumber.current = eventNumber;

              // update the presence data
              latestPresentData.current = presenceMembers;
              setPresenceData(presenceMembers);

              // clear any previous errors as we have now resolved to the latest state
              if (errorRef.current) {
                clearErrorState();
              }
            })
            .catch(() => {
              const willReattempt = numRetries.current < PRESENCE_GET_MAX_RETRIES;

              if (!willReattempt) {
                // since we have reached the maximum number of retries, set the error state
                logger.error('usePresenceListener(); failed to fetch presence data after max retries');
                setErrorState(
                  new Ably.ErrorInfo(
                    'unable to fetch presence data; failed after max retries',
                    ErrorCode.PresenceFetchFailed,
                    500,
                  ),
                );
                return;
              }

              // if we are currently waiting for a retry, do nothing as a new event has been received
              if (retryTimeout.current) {
                logger.debug('usePresenceListener(); waiting for retry but new event received');
                return;
              }

              const waitBeforeRetry = Math.min(
                PRESENCE_GET_RETRY_MAX_INTERVAL_MS,
                PRESENCE_GET_RETRY_INTERVAL_MS * Math.pow(2, numRetries.current),
              );

              numRetries.current += 1;
              logger.debug('usePresenceListener(); retrying to fetch presence data', {
                numRetries: numRetries.current,
              });

              retryTimeout.current = setTimeout(() => {
                retryTimeout.current = undefined;
                receivedEventNumber.current += 1;
                getAndSetState(receivedEventNumber.current);
              }, waitBeforeRetry);
            });

          return () => {
            // No-op
          };
        },
        logger,
      );
    };

    return wrapRoomPromise(
      context.room,
      (room) => {
        let unsubscribe: (() => void) | undefined;
        // If the room isn't attached yet, we can't do the initial fetch
        if (room.status === RoomStatus.Attached) {
          room.presence
            .get({ waitForSync: true })
            .then((presenceMembers) => {
              logger.debug('usePresenceListener(); fetched initial presence data', {
                presenceMembers,
              });
              // on mount, fetch the initial presence data
              latestPresentData.current = presenceMembers;
              setPresenceData(presenceMembers);

              // clear any previous errors
              clearErrorState();
            })
            .catch((error: unknown) => {
              const errorInfo = error as Ably.ErrorInfo;
              if (errorInfoIs(errorInfo, ErrorCode.RoomInInvalidState)) return;

              logger.error('usePresenceListener(); error fetching initial presence data', {
                error,
              });
              setErrorState(errorInfo);
            })
            .finally(() => {
              // subscribe to presence events
              logger.debug('usePresenceListener(); subscribing internal listener to presence events');
              const result = room.presence.subscribe(() => {
                updatePresenceData();
              });
              unsubscribe = result.unsubscribe;
            });
        } else {
          // subscribe to presence events
          logger.debug('usePresenceListener(); not yet attached, subscribing internal listener to presence events');
          const result = room.presence.subscribe(() => {
            updatePresenceData();
          });
          unsubscribe = result.unsubscribe;
        }

        return () => {
          if (unsubscribe) {
            logger.debug('usePresenceListener(); cleaning up internal listener');
            unsubscribe();
          }
        };
      },
      logger,
    ).unmount();
  }, [context, setErrorState, clearErrorState, logger]);

  // subscribe the user provided listener to presence changes
  useEffect(() => {
    if (!listenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('usePresenceListener(); applying external listener');
        const { unsubscribe } = room.presence.subscribe(listenerRef);

        return () => {
          logger.debug('usePresenceListener(); cleaning up external listener');
          unsubscribe();
        };
      },
      logger,
    ).unmount();
  }, [context, listenerRef, logger]);

  // subscribe the user provided onDiscontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('usePresenceListener(); applying onDiscontinuity listener');
        const { off } = room.onDiscontinuity(onDiscontinuityRef);

        return () => {
          logger.debug('usePresenceListener(); removing onDiscontinuity listener');
          off();
        };
      },
      logger,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    error,
    presenceData: presenceData,
  };
};
