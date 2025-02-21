import * as Ably from 'ably';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ErrorCodes, errorInfoIs } from '../../core/errors.js';
import { Presence, PresenceListener, PresenceMember } from '../../core/presence.js';
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
  readonly presence?: Presence;

  readonly isSyncing: boolean;

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

  const context = useRoomContext('usePresenceListener');
  const { status: roomStatus, error: roomError } = useRoomStatus(params);

  const logger = useLogger();
  logger.trace('usePresenceListener();', { roomId: context.roomId });

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [presenceData, setPresenceData] = useState<PresenceMember[]>([]);
  const errorRef = useRef<Ably.ErrorInfo | undefined>(undefined);

  const [error, setError] = useState<Ably.ErrorInfo | undefined>();

  // create stable references for the listeners
  const listenerRef = useEventListenerRef(params?.listener);
  const onDiscontinuityRef = useEventListenerRef(params?.onDiscontinuity);

  const setErrorState = useCallback(
    (error: Ably.ErrorInfo) => {
      logger.debug('usePresenceListener(); setting error state', { error, roomId: context.roomId });
      errorRef.current = error;
      setError(error);
    },
    [logger, context],
  );

  const clearErrorState = useCallback(() => {
    logger.debug('usePresenceListener(); clearing error state', { roomId: context.roomId });
    errorRef.current = undefined;
    setError(undefined);
  }, [logger, context]);

  useEffect(() => {
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
                roomId: context.roomId,
              });
              // on mount, fetch the initial presence data
              setPresenceData(presenceMembers);
              // clear any previous errors
              clearErrorState();
            })
            .catch((error: unknown) => {
              const errorInfo = error as Ably.ErrorInfo;
              if (errorInfoIs(errorInfo, ErrorCodes.RoomIsReleased)) return;

              logger.error('usePresenceListener(); error fetching initial presence data', {
                error,
                roomId: context.roomId,
              });
              setErrorState(errorInfo);
            })
            .finally(() => {
              // subscribe to presence events
              logger.debug('usePresenceListener(); subscribing internal listener to presence events', {
                roomId: context.roomId,
              });
              const result = room.presence.onPresenceSetChange((event) => {
                logger.debug('usePresenceListener(); new presence members', event.members);
                setPresenceData(event.members);
                setIsSyncing(event.syncInProgress);
              });
              unsubscribe = result.off;
            });
        } else {
          // subscribe to presence events
          logger.debug('usePresenceListener(); not yet attached, subscribing internal listener to presence events', {
            roomId: context.roomId,
          });
          const result = room.presence.onPresenceSetChange((event) => {
            logger.debug('usePresenceListener(); new presence members', event.members);
            setPresenceData(event.members);
            setIsSyncing(event.syncInProgress);
          });
          unsubscribe = result.off;
        }

        return () => {
          if (unsubscribe) {
            logger.debug('usePresenceListener(); cleaning up internal listener', { roomId: context.roomId });
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
        logger.debug('usePresenceListener(); applying external listener', { roomId: context.roomId });
        const { unsubscribe } = room.presence.subscribe(listenerRef);

        return () => {
          logger.debug('usePresenceListener(); cleaning up external listener', { roomId: context.roomId });
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
        logger.debug('usePresenceListener(); applying onDiscontinuity listener', { roomId: context.roomId });
        const { off } = room.presence.onDiscontinuity(onDiscontinuityRef);

        return () => {
          logger.debug('usePresenceListener(); removing onDiscontinuity listener', { roomId: context.roomId });
          off();
        };
      },
      logger,
      context.roomId,
    ).unmount();
  }, [context, onDiscontinuityRef, logger]);

  return {
    presence: useEventualRoomProperty((room) => room.presence),
    connectionStatus,
    connectionError,
    roomStatus,
    roomError,
    error,
    presenceData: presenceData,
    isSyncing,
  };
};
