import { useEffect, useState } from 'react';

import { Room } from '../../../core/room.js';
import { useRoomLogger } from './use-logger.js';
import { useRoomContext } from './use-room-context.js';
import { useStableReference } from './use-stable-reference.js';

/**
 * This hook will take the room promise from the current context and return the room object once it has been resolved.
 * This is useful in hooks like useRoom to provide a direct reference to the room object, as Promises aren't usually
 * the best thing to be passing around React components.
 * @internal
 * @returns The room object if it has resolved, otherwise undefined
 */
export const useEventualRoom = (): Room | undefined => {
  const [roomState, setRoomState] = useState<Room | undefined>();
  const context = useRoomContext('useEventualRoom');
  const logger = useRoomLogger();
  logger.trace('useEventualRoom();');

  useEffect(() => {
    logger.debug('useEventualRoom(); running useEffect');
    let unmounted = false;
    void context.room
      .then((room: Room) => {
        if (unmounted) {
          logger.debug('useEventualRoom(); already unmounted');
          return;
        }

        logger.debug('useEventualRoom(); resolved');
        setRoomState(room);
      })
      .catch((error: unknown) => {
        logger.error('Failed to get room', { error });
      });

    return () => {
      logger.debug('useEventualRoom(); cleanup');
      unmounted = true;
    };
  }, [context, logger]);

  return roomState;
};

/**
 * Similar to useEventualRoom, but instead of providing the room itself, it provides a property of the room - e.g.
 * Messages. We use this to eventually provide access to underlying room interfaces as non-promise values
 * in hooks like useMessages.
 * @param onResolve Callback function that receives the room and returns a property of it.
 * @internal
 * @returns The property of the room object that's been resolved, as returned by the onResolve callback,
 * or undefined if the room hasn't resolved yet.
 */
export const useEventualRoomProperty = <T>(onResolve: (room: Room) => T) => {
  const [roomState, setRoomState] = useState<T | undefined>();
  const context = useRoomContext('useEventualRoomProperty');
  const logger = useRoomLogger();
  logger.trace('useEventualRoomProperty();');
  const onResolveRef = useStableReference(onResolve);

  useEffect(() => {
    let unmounted = false;
    logger.debug('useEventualRoomProperty(); running useEffect');
    void context.room
      .then((room: Room) => {
        if (unmounted) {
          logger.debug('useEventualRoomProperty(); already unmounted');
          return;
        }

        logger.debug('useEventualRoomProperty(); resolved');
        setRoomState(onResolveRef(room));
      })
      .catch((error: unknown) => {
        logger.error('Failed to get room', { error });
      });

    return () => {
      logger.debug('useEventualRoomProperty(); cleanup');
      unmounted = true;
    };
  }, [context, logger, onResolveRef]);

  return roomState;
};
