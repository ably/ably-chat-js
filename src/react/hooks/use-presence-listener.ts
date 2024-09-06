import { Presence, PresenceListener, PresenceMember } from '@ably/chat';
import * as Ably from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useEventListenerRef } from '../helper/use-event-listener-ref.js';
import { ChatStatusResponse } from '../types/chat-status-response.js';
import { Listenable } from '../types/listenable.js';
import { StatusParams } from '../types/status-params.js';
import { useChatConnection } from './use-chat-connection.js';
import { useLogger } from './use-logger.js';
import { useRoom } from './use-room.js';

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
   */
  listener?: PresenceListener;
}

export interface UsePresenceListenerResponse extends ChatStatusResponse {
  /**
   * The current state of all the presence members, observed as a whole change, and only emitted while presence is not syncing.
   */
  readonly presenceData: PresenceMember[];

  /**
   * Provides access to the underlying {@link Presence} instance of the room.
   */
  readonly presence: Presence;

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
 * A hook that provides access to the {@link Presence} instance in the room and the current presence state.
 * It will use the instance belonging to the room in the nearest {@link ChatRoomProvider} in the component tree.
 * On calling, the hook will subscribe to the presence state of the room and update the state accordingly.
 *
 * @param params - Allows the registering of optional callbacks.
 * @returns UsePresenceResponse - An object containing the {@link Presence} instance and the current presence state.
 */
export const usePresenceListener = (params?: UsePresenceListenerParams): UsePresenceListenerResponse => {
  const { currentStatus: connectionStatus, error: connectionError } = useChatConnection({
    onStatusChange: params?.onConnectionStatusChange,
  });
  const { room, roomError, roomStatus } = useRoom({
    onStatusChange: params?.onRoomStatusChange,
  });

  const logger = useLogger();
  logger.trace('usePresenceListener();', { roomId: room.roomId });

  const receivedEventNumber = useRef(0);
  const triggeredEventNumber = useRef(0);
  const retryTimeout = useRef<ReturnType<typeof setTimeout>>();
  const numRetries = useRef(0);
  const latestPresentData = useRef<PresenceMember[]>([]);
  const [presenceData, setPresenceData] = useState<PresenceMember[]>([]);
  const errorRef = useRef<Ably.ErrorInfo | undefined>();

  const [error, setError] = useState<Ably.ErrorInfo | undefined>();

  // create stable references for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  const setErrorState = useCallback(
    (error: Ably.ErrorInfo) => {
      logger.debug('usePresenceListener(); setting error state', { error, roomId: room.roomId });
      errorRef.current = error;
      setError(error);
    },
    [logger, room.roomId],
  );

  const clearErrorState = useCallback(() => {
    logger.debug('usePresenceListener(); clearing error state', { roomId: room.roomId });
    errorRef.current = undefined;
    setError(undefined);
  }, [logger, room.roomId]);

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
      room.presence
        .get({ waitForSync: true })
        .then((presenceMembers) => {
          logger.debug('usePresenceListener(); fetched presence data', { presenceMembers, roomId: room.roomId });

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
            logger.error('usePresenceListener(); failed to fetch presence data after max retries', {
              roomId: room.roomId,
            });
            setErrorState(new Ably.ErrorInfo(`failed to fetch presence data after max retries`, 50000, 500));
            return;
          }

          // if we are currently waiting for a retry, do nothing as a new event has been received
          if (retryTimeout.current) {
            logger.debug('usePresenceListener(); waiting for retry but new event received', { roomId: room.roomId });
            return;
          }

          const waitBeforeRetry = Math.min(
            PRESENCE_GET_RETRY_MAX_INTERVAL_MS,
            PRESENCE_GET_RETRY_INTERVAL_MS * Math.pow(2, numRetries.current),
          );

          numRetries.current += 1;
          logger.debug('usePresenceListener(); retrying to fetch presence data', {
            numRetries: numRetries.current,
            roomId: room.roomId,
          });

          retryTimeout.current = setTimeout(() => {
            retryTimeout.current = undefined;
            receivedEventNumber.current += 1;
            getAndSetState(receivedEventNumber.current);
          }, waitBeforeRetry);
        });
    };

    let unsubscribe: (() => void) | undefined;
    room.presence
      .get({ waitForSync: true })
      .then((presenceMembers) => {
        logger.debug('usePresenceListener(); fetched initial presence data', { presenceMembers, roomId: room.roomId });
        // on mount, fetch the initial presence data
        latestPresentData.current = presenceMembers;
        setPresenceData(presenceMembers);

        // clear any previous errors
        clearErrorState();
      })
      .catch((error: unknown) => {
        logger.error('usePresenceListener(); error fetching initial presence data', { error, roomId: room.roomId });
        setErrorState(error as Ably.ErrorInfo);
      })
      .finally(() => {
        // subscribe to presence events
        logger.debug('usePresenceListener(); subscribing internal listener to presence events', {
          roomId: room.roomId,
        });
        const result = room.presence.subscribe(() => {
          updatePresenceData();
        });
        unsubscribe = result.unsubscribe;
      });
    return () => {
      if (unsubscribe) {
        logger.debug('usePresenceListener(); cleaning up internal listener', { roomId: room.roomId });
        unsubscribe();
      }
    };
  }, [room, setErrorState, clearErrorState, logger]);

  // subscribe the user provided listener to presence changes
  useEffect(() => {
    if (!listenerRef) return;
    const { unsubscribe } = room.presence.subscribe(listenerRef);
    logger.debug('usePresenceListener(); applying external listener', { roomId: room.roomId });

    return () => {
      logger.debug('usePresenceListener(); cleaning up external listener', { roomId: room.roomId });
      unsubscribe();
    };
  }, [room, listenerRef, logger]);

  // subscribe the user provided onDiscontinuity listener
  useEffect(() => {
    if (!onDiscontinuityRef) return;
    logger.debug('usePresenceListener(); applying onDiscontinuity listener', { roomId: room.roomId });
    const { off } = room.presence.onDiscontinuity(onDiscontinuityRef);

    return () => {
      logger.debug('usePresenceListener(); removing onDiscontinuity listener', { roomId: room.roomId });
      off();
    };
  }, [room, onDiscontinuityRef, logger]);

  return {
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    error,
    presenceData: presenceData,
    presence: room.presence,
  };
};
