import * as Ably from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorCodes, errorInfoIs } from '../../core/errors.js';
import { OnlineMember, OnlineStatus, OnlineStatusListener } from '../../core/online-status.js';
import { Room } from '../../core/room.js';
import { RoomStatus } from '../../core/room-status.js';
import { wrapRoomPromise } from '../helper/room-promise.js';
import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { useEventualRoomProperty } from '../helper/use-eventual-room.js';
import { useRoomContext } from '../helper/use-room-context.js';
import { useRoomStatus } from '../helper/use-room-status.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';

/**
 * The interval between retries when fetching status data.
 */
const ONLINE_STATUS_GET_RETRY_INTERVAL_MS = 1500;

/**
 * The maximum interval between retries when fetching status data.
 */
const ONLINE_STATUS_GET_RETRY_MAX_INTERVAL_MS = 30000;

/**
 * The maximum number of retries when fetching status data with {@link OnlineStatus.get}.
 */
const ONLINE_STATUS_GET_MAX_RETRIES = 5;

/**
 * The options for the {@link useOnlineStatusListener} hook.
 */
export interface UseOnlineStatusListenerParams extends StatusParams, Listenable<OnlineStatusListener> {
  /**
   * The listener to be called when the online status changes.
   * The listener is removed when the component unmounts.
   */
  listener?: OnlineStatusListener;
}

export interface UseOnlineStatusListenerResponse extends ChatStatusResponse {
  /**
   * The current state of all the online members, observed as a whole change.
   */
  readonly onlineMembers: OnlineMember[];

  /**
   * Provides access to the underlying {@link OnlineStatus} instance of the room.
   */
  readonly onlineStatus?: OnlineStatus;

  /**
   * The error state of the online-status listener.
   * The hook keeps {@link onlineMembers} up to date asynchronously, so this error state is provided to allow
   * the user to handle errors that may occur when fetching status data.
   * It will be set if there is an error fetching the initial status data,
   * or if there is an error when fetching status data after a {@link OnlineStatusEvents} event.
   * The error will be cleared once a new status event is received and successfully processed.
   */
  readonly error?: Ably.ErrorInfo;
}

/**
 * A hook that provides access to the {@link OnlineStatus} instance in the room and the current online state.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 * On calling, the hook will subscribe to the online state of the room and update the state accordingly.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UseOnlineStatusListenerResponse - An object
 * containing the {@link OnlineStatus} instance and the current online state.
 */
export const useOnlineStatusListener = (params?: UseOnlineStatusListenerParams): UseOnlineStatusListenerResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });

  const context = useRoomContext('useOnlineStatusListener');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);

  const logger = useLogger();
  logger.trace('useOnlineStatusListener();', { roomId: context.roomId });

  const receivedEventNumber = useRef(0);
  const triggeredEventNumber = useRef(0);
  const retryTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const numRetries = useRef(0);
  const latestOnlineMembers = useRef<OnlineMember[]>([]);
  const [onlineMembers, setOnlineMembers] = useState<OnlineMember[]>([]);
  const errorRef = useRef<Ably.ErrorInfo | undefined>(undefined);

  const [error, setError] = useState<Ably.ErrorInfo | undefined>();

  // create stable references for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  const setErrorState = useCallback(
    (error: Ably.ErrorInfo) => {
      logger.debug('useOnlineStatusListener(); setting error state', { error, roomId: context.roomId });
      errorRef.current = error;
      setError(error);
    },
    [logger, context],
  );

  const clearErrorState = useCallback(() => {
    logger.debug('useOnlineStatusListener(); clearing error state', { roomId: context.roomId });
    errorRef.current = undefined;
    setError(undefined);
  }, [logger, context]);

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
          room.userStatus.onlineStatus
            .get({ waitForSync: true })
            .then((onlineMembers) => {
              logger.debug('useOnlineStatusListener(); fetched status data', { onlineMembers, roomId: context.roomId });

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

              // update the status data
              latestOnlineMembers.current = onlineMembers;
              setOnlineMembers(onlineMembers);

              // clear any previous errors as we have now resolved to the latest state
              if (errorRef.current) {
                clearErrorState();
              }
            })
            .catch(() => {
              const willReattempt = numRetries.current < ONLINE_STATUS_GET_MAX_RETRIES;

              if (!willReattempt) {
                // since we have reached the maximum number of retries, set the error state
                logger.error('useOnlineStatusListener(); failed to fetch status data after max retries', {
                  roomId: context.roomId,
                });
                setErrorState(new Ably.ErrorInfo(`failed to fetch status data after max retries`, 50000, 500));
                return;
              }

              // if we are currently waiting for a retry, do nothing as a new event has been received
              if (retryTimeout.current) {
                logger.debug('useOnlineStatusListener(); waiting for retry but new event received', {
                  roomId: context.roomId,
                });
                return;
              }

              const waitBeforeRetry = Math.min(
                ONLINE_STATUS_GET_RETRY_MAX_INTERVAL_MS,
                ONLINE_STATUS_GET_RETRY_INTERVAL_MS * Math.pow(2, numRetries.current),
              );

              numRetries.current += 1;
              logger.debug('useOnlineStatusListener(); retrying to fetch status data', {
                numRetries: numRetries.current,
                roomId: context.roomId,
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
        context.roomId,
      );
    };

    return wrapRoomPromise(
      context.room,
      (room) => {
        let unsubscribe: (() => void) | undefined;
        // If the room isn't attached yet, we can't do the initial fetch
        if (room.status === RoomStatus.Attached) {
          room.userStatus.onlineStatus
            .get({ waitForSync: true })
            .then((onlineMembers) => {
              logger.debug('useOnlineStatusListener(); fetched initial status data', {
                onlineMembers,
                roomId: context.roomId,
              });
              // on mount, fetch the initial status data
              latestOnlineMembers.current = onlineMembers;
              setOnlineMembers(onlineMembers);

              // clear any previous errors
              clearErrorState();
            })
            .catch((error: unknown) => {
              const errorInfo = error as Ably.ErrorInfo;
              if (errorInfoIs(errorInfo, ErrorCodes.RoomIsReleased)) return;

              logger.error('useOnlineStatusListener(); error fetching initial status data', {
                error,
                roomId: context.roomId,
              });
              setErrorState(errorInfo);
            })
            .finally(() => {
              // subscribe to status events
              logger.debug('useOnlineStatusListener(); subscribing internal listener to status events', {
                roomId: context.roomId,
              });
              const result = room.userStatus.onlineStatus.subscribe(() => {
                updatePresenceData();
              });
              unsubscribe = result.unsubscribe;
            });
        } else {
          // subscribe to status events
          logger.debug('useOnlineStatusListener(); not yet attached, subscribing internal listener to status events', {
            roomId: context.roomId,
          });
          const result = room.userStatus.onlineStatus.subscribe(() => {
            updatePresenceData();
          });
          unsubscribe = result.unsubscribe;
        }

        return () => {
          if (unsubscribe) {
            logger.debug('useOnlineStatusListener(); cleaning up internal listener', { roomId: context.roomId });
            unsubscribe();
          }
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, setErrorState, clearErrorState, logger]);

  // subscribe the user provided listener to presence changes
  useEffect(() => {
    if (!listenerRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useOnlineStatusListener(); applying external listener', { roomId: context.roomId });
        const { unsubscribe } = room.userStatus.onlineStatus.subscribe(listenerRef);

        return () => {
          logger.debug('useOnlineStatusListener(); cleaning up external listener', { roomId: context.roomId });
          unsubscribe();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, listenerRef, logger]);

  // subscribe the user provided onDiscontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    return wrapRoomPromise(
      context.room,
      (room) => {
        logger.debug('useOnlineStatusListener(); applying onDiscontinuity listener', { roomId: context.roomId });
        const { off } = room.userStatus.onDiscontinuity(onDiscontinuityRef);

        return () => {
          logger.debug('useOnlineStatusListener(); removing onDiscontinuity listener', { roomId: context.roomId });
          off();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  return {
    onlineStatus: useEventualRoomProperty((room) => room.userStatus.onlineStatus),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    error,
    onlineMembers: onlineMembers,
  };
};
