import { Room, RoomLifecycle, RoomStatusChange } from '@ably/chat';
import * as Ably from 'ably';
import { useEffect, useState } from 'react';

import { useLogger } from '../hooks/use-logger.js';
import { wrapRoomPromise } from './room-promise.js';
import { useEventListenerRef } from './use-event-listener-ref.js';
import { useRoomContext } from './use-room-context.js';

/**
 * The response object for the useRoomStatus hook.
 */
export interface UseRoomStatusResponse {
  /**
   * The current status of the room.
   */
  readonly status: RoomLifecycle;

  /**
   * The error that caused the room to transition to an errored state.
   */
  readonly error?: Ably.ErrorInfo;
}

/**
 * A hook that returns the current status of the room, and listens for changes to the room status.
 *
 * @param params An optional user-provided listener for room status changes.
 * @returns The current status of the room, and an error if the room is in an errored state.
 */
export const useRoomStatus = (params?: {
  onRoomStatusChange?: (change: RoomStatusChange) => void;
}): UseRoomStatusResponse => {
  const context = useRoomContext('useRoomStatus');

  const [status, setStatus] = useState<RoomLifecycle>(RoomLifecycle.Initialized);
  const [error, setError] = useState<Ably.ErrorInfo | undefined>();
  const logger = useLogger();

  // create an internal listener to update the status
  useEffect(() => {
    const roomPromise = wrapRoomPromise(
      context.room,
      (room: Room) => {
        logger.debug('useRoomStatus(); subscribing internal listener');
        // Set instantaneous values
        setStatus(room.status.current);
        setError(room.status.error);

        // Add the subscription
        const { off } = room.status.onChange((change) => {
          logger.debug('useRoomStatus(); status change', change);
          setStatus(change.current);
          setError(change.error);
        });

        return () => {
          logger.debug('useRoomStatus(); unsubscribing internal listener');
          off();
        };
      },
      logger,
      context.roomId,
    );

    return roomPromise.unmount();
  }, [context, logger]);

  // create stable references for the listeners and register the user-provided callbacks
  const onRoomStatusChangeRef = useEventListenerRef(params?.onRoomStatusChange);

  useEffect(() => {
    const roomPromise = wrapRoomPromise(
      context.room,
      (room: Room) => {
        let off: (() => void) | undefined;
        if (onRoomStatusChangeRef) {
          logger.debug('useRoomStatus(); subscribing to status changes');
          off = room.status.onChange(onRoomStatusChangeRef).off;
        }

        logger.debug('useRoomStatus(); setting initial status', { status: room.status.current });
        if (onRoomStatusChangeRef) {
          logger.debug('useRoomStatus(); sending initial status event');
          onRoomStatusChangeRef({
            current: room.status.current,
            previous: RoomLifecycle.Initializing,
            error: room.status.error,
          });
        }

        return () => {
          logger.debug('useRoomStatus(); unmounting');
          if (off) {
            logger.debug('useRoomStatus(); unsubscribing from status changes');
            off();
          }
        };
      },
      logger,
      context.roomId,
    );

    return roomPromise.unmount();
  }, [context, logger, onRoomStatusChangeRef]);

  return {
    status,
    error,
  };
};
