import * as Ably from 'ably';
import cloneDeep from 'lodash.clonedeep';

import { ChatApi } from './chat-api.js';
import { ErrorCodes } from './errors.js';
import { Logger } from './logger.js';
import { DefaultMessages, Messages } from './messages.js';
import { DefaultOccupancy, Occupancy } from './occupancy.js';
import { DefaultPresence, Presence } from './presence.js';
import { ContributesToRoomLifecycle, RoomLifecycleManager } from './room-lifecycle-manager.js';
import { RoomOptions, validateRoomOptions } from './room-options.js';
import { DefaultRoomReactions, RoomReactions } from './room-reactions.js';
import {
  DefaultRoomLifecycle,
  InternalRoomLifecycle,
  OnRoomStatusChangeResponse,
  RoomStatus,
  RoomStatusListener,
} from './room-status.js';
import { DefaultTyping, Typing } from './typing.js';

/**
 * Represents a chat room.
 */
export interface Room {
  /**
   * The unique identifier of the room.
   * @returns The room identifier.
   */
  get roomId(): string;

  /**
   * Allows you to send, subscribe-to and query messages in the room.
   *
   * @returns The messages instance for the room.
   */
  get messages(): Messages;

  /**
   * Allows you to subscribe to presence events in the room.
   *
   * @throws {@link ErrorInfo}} if presence is not enabled for the room.
   * @returns The presence instance for the room.
   */
  get presence(): Presence;

  /**
   * Allows you to interact with room-level reactions.
   *
   * @throws {@link ErrorInfo} if reactions are not enabled for the room.
   * @returns The room reactions instance for the room.
   */
  get reactions(): RoomReactions;

  /**
   * Allows you to interact with typing events in the room.
   *
   * @throws {@link ErrorInfo} if typing is not enabled for the room.
   * @returns The typing instance for the room.
   */
  get typing(): Typing;

  /**
   * Allows you to interact with occupancy metrics for the room.
   *
   * @throws {@link ErrorInfo} if occupancy is not enabled for the room.
   * @returns The occupancy instance for the room.
   */
  get occupancy(): Occupancy;

  /**
   * The current status of the room.
   *
   * @returns The current status.
   */
  get status(): RoomStatus;

  /**
   * The current error, if any, that caused the room to enter the current status.
   */
  get error(): Ably.ErrorInfo | undefined;

  /**
   * Registers a listener that will be called whenever the room status changes.
   * @param listener The function to call when the status changes.
   * @returns An object that can be used to unregister the listener.
   */
  onStatusChange(listener: RoomStatusListener): OnRoomStatusChangeResponse;

  /**
   * Removes all listeners that were added by the `onStatusChange` method.
   */
  offAllStatusChange(): void;

  /**
   * Attaches to the room to receive events in realtime.
   *
   * If a room fails to attach, it will enter either the {@link RoomStatus.Suspended} or {@link RoomStatus.Failed} state.
   *
   * If the room enters the failed state, then it will not automatically retry attaching and intervention is required.
   *
   * If the room enters the suspended state, then the call to attach will reject with the {@link ErrorInfo} that caused the suspension. However,
   * the room will automatically retry attaching after a delay.
   *
   * @returns A promise that resolves when the room is attached.
   */
  attach(): Promise<void>;

  /**
   * Detaches from the room to stop receiving events in realtime.
   *
   * @returns A promise that resolves when the room is detached.
   */
  detach(): Promise<void>;

  /**
   * Returns the room options.
   *
   * @returns A copy of the options used to create the room.
   */
  options(): RoomOptions;
}

// Returns a promise that always resolves when p is settled, regardless of whether p is resolved or rejected.
function makeAlwaysResolves(p: Promise<void>): Promise<void> {
  return new Promise<void>((res) => {
    p.then(() => {
      res();
    }).catch(() => {
      res();
    });
  });
}

// Returns a promise that gets resolved when p gets resolved, and rejected when either p is rejected or the returned reject function is called.
function makeRejectablePromise<T>(p: Promise<T>): { promise: Promise<T>; reject: (reason: unknown) => boolean } {
  let insideReject: ((reason: unknown) => void) | undefined;

  const reject = (reason: unknown) => {
    if (insideReject) {
      insideReject(reason);
      insideReject = undefined;
      return true;
    }
    return false;
  };

  const promise = new Promise<T>((res, rej) => {
    insideReject = rej;
    p.then((data) => {
      if (!insideReject) {
        // Do nothing if already settled
        return;
      }
      insideReject = undefined;
      res(data);
    }).catch((error: unknown) => {
      if (!insideReject) {
        // Do nothing if already settled
        return;
      }
      insideReject = undefined;
      rej(error as Error);
    });
  });

  return { promise, reject };
}

export class DefaultRoom implements Room {
  private readonly _roomId: string;
  private readonly _options: RoomOptions;
  private readonly _chatApi: ChatApi;
  private readonly _messages: DefaultMessages;
  private readonly _typing?: DefaultTyping;
  private readonly _presence?: DefaultPresence;
  private readonly _reactions?: DefaultRoomReactions;
  private readonly _occupancy?: DefaultOccupancy;
  private readonly _logger: Logger;
  private readonly _lifecycle: DefaultRoomLifecycle;
  private _lifecycleManager?: RoomLifecycleManager;
  private _finalizer: () => Promise<void>;
  private readonly _asyncOpsAfter: Promise<void>;

  /**
   * Constructs a new Room instance.
   *
   * @param roomId The unique identifier of the room.
   * @param options The options for the room.
   * @param realtime An instance of the Ably Realtime client.
   * @param chatApi An instance of the ChatApi.
   * @param logger An instance of the Logger.
   * @param initAfter The room will wait for this promise to finish before initializing
   */
  constructor(
    roomId: string,
    options: RoomOptions,
    realtime: Ably.Realtime,
    chatApi: ChatApi,
    logger: Logger,
    initAfter: Promise<void>,
  ) {
    validateRoomOptions(options);
    logger.debug('Room();', { roomId, options });

    this._roomId = roomId;
    this._options = options;
    this._chatApi = chatApi;
    this._logger = logger;
    this._lifecycle = new DefaultRoomLifecycle(logger);

    // Room initialization: handle the state before features start to be initialized
    // We don't need to catch it here as we immediately go into _asyncOpsAfter where we catch it
    const rejectablePromise = makeRejectablePromise(makeAlwaysResolves(initAfter));
    const initFeaturesAfter = rejectablePromise.promise;

    this._finalizer = () => {
      const rejectedNow = rejectablePromise.reject(
        new Ably.ErrorInfo('Room released before initialization started', ErrorCodes.RoomIsReleased, 400),
      );
      if (rejectedNow) {
        // when this promise is rejected by calling reject(), the room is released
        this._lifecycle.setStatus({ status: RoomStatus.Released });
      }
      return initAfter;
    };

    // Setup features
    this._messages = new DefaultMessages(
      roomId,
      realtime,
      this._chatApi,
      realtime.auth.clientId,
      logger,
      initFeaturesAfter,
    );

    const features: ContributesToRoomLifecycle[] = [this._messages];

    if (options.presence) {
      this._logger.debug('enabling presence on room', { roomId });
      this._presence = new DefaultPresence(
        roomId,
        options,
        realtime,
        realtime.auth.clientId,
        logger,
        initFeaturesAfter,
      );
      features.push(this._presence);
    }

    if (options.typing) {
      this._logger.debug('enabling typing on room', { roomId });
      this._typing = new DefaultTyping(
        roomId,
        options.typing,
        realtime,
        realtime.auth.clientId,
        logger,
        initFeaturesAfter,
      );
      features.push(this._typing);
    }

    if (options.reactions) {
      this._logger.debug('enabling reactions on room', { roomId });
      this._reactions = new DefaultRoomReactions(roomId, realtime, realtime.auth.clientId, logger, initFeaturesAfter);
      features.push(this._reactions);
    }

    if (options.occupancy) {
      this._logger.debug('enabling occupancy on room', { roomId });
      this._occupancy = new DefaultOccupancy(roomId, realtime, this._chatApi, logger, initFeaturesAfter);
      features.push(this._occupancy);
    }

    this._asyncOpsAfter = this._setupAsyncRoomInit(features, initFeaturesAfter, realtime);

    // Catch errors from asyncOpsAfter to prevent unhandled promise rejection error and print a debug log
    // This only prevents the base promise from erroring - calls to attach, detach etc that depend on _asyncOpsAfter
    // will need to specify their own error handling.
    this._asyncOpsAfter.catch((error: unknown) => {
      this._logger.debug('Room initialization was prevented before finishing', { error: error, roomId: roomId });
    });
  }

  /**
   * Runs async room initialization and waits for all features to finish initializing. Handles calls to release()
   * at different points in the initialization process.
   *
   * @param features Array of all enabled room features that are to be initialized with channels.
   * @param initFeaturesAfter Initialization of features starts after this promise resolves
   * @param realtime The Ably.Realtime instance used by this room
   * @returns A promise that is resolved when the room is initialized or rejected if the room is released before initialization finishes.
   */
  private _setupAsyncRoomInit(
    features: ContributesToRoomLifecycle[],
    initFeaturesAfter: Promise<void>,
    realtime: Ably.Realtime,
  ): Promise<void> {
    // Wait for features to finish initializing and then finish initializing
    // the room. Set _asyncOpsAfter to the promise that waits for the room to
    // finish initializing. This promise is awaited before performing any async
    // operations at room level (attach and detach).
    const rejectableAsyncOpsAfter = makeRejectablePromise(
      initFeaturesAfter.then(() => {
        // Features have now started initializing so we can no longer stop the
        // initialization process. Features haven't yet finished initializing,
        // so if release() is called we first need to wait for initialization to
        // finish before releasing. We use a promise to wait for the correct
        // release function.

        let setFinalizerFunc: (f: () => Promise<void>) => void;
        const finalizerFuncPromise = new Promise<() => Promise<void>>((resolve) => {
          setFinalizerFunc = resolve;
        });
        this._finalizer = () => {
          // Make sure async ops (attach or detach) don't run after calling release()
          rejectableAsyncOpsAfter.reject(
            new Ably.ErrorInfo('Room released before initialization finished', ErrorCodes.RoomIsReleased, 400),
          );
          return finalizerFuncPromise.then((f) => {
            return f();
          });
        };

        // Setup all contributors with resolved channels
        interface ContributorWithChannel {
          channel: Ably.RealtimeChannel;
          contributor: ContributesToRoomLifecycle;
        }
        const promises = features.map((feature) => {
          return feature.channel.then((channel): ContributorWithChannel => {
            return {
              channel: channel,
              contributor: feature,
            };
          });
        });

        // With all features with resolved channels:
        // - setup room lifecycle manager
        // - mark the room as initialized
        // - setup finalizer function
        return Promise.all(promises)
          .then((contributors) => {
            const manager = new RoomLifecycleManager(this._lifecycle, contributors.toReversed(), this._logger, 5000);
            this._lifecycleManager = manager;

            let finalized = false;
            setFinalizerFunc((): Promise<void> => {
              if (finalized) {
                return Promise.resolve();
              }
              finalized = true;
              return manager.release().then(() => {
                for (const contributor of contributors) {
                  realtime.channels.release(contributor.channel.name);
                }
              });
            });
            this._lifecycle.setStatus({ status: RoomStatus.Initialized });
          })
          .catch((error: unknown) => {
            // this should never happen because contributor channel promises
            // should only reject when initFeaturesAfter is rejected. We log
            // here just in case.
            setFinalizerFunc(() => Promise.resolve());
            this._logger.error('Room features initialization failed', { error: error, roomId: this.roomId });
            this._lifecycle.setStatus({
              status: RoomStatus.Failed,
              error: new Ably.ErrorInfo('Room features initialization failed.', 40000, 400, error as Error),
            });
            throw error;
          });
      }),
    );

    return rejectableAsyncOpsAfter.promise;
  }

  /**
   * @inheritdoc Room
   */
  get roomId(): string {
    return this._roomId;
  }

  /**
   * @inheritDoc Room
   */
  options(): RoomOptions {
    return cloneDeep(this._options);
  }

  /**
   * @inheritdoc Room
   */
  get messages(): Messages {
    return this._messages;
  }

  /**
   * @inheritdoc Room
   */
  get presence(): Presence {
    if (!this._presence) {
      this._logger.error('Presence is not enabled for this room');
      throw new Ably.ErrorInfo('Presence is not enabled for this room', 40000, 400);
    }

    return this._presence;
  }

  /**
   * @inheritdoc Room
   */
  get reactions(): RoomReactions {
    if (!this._reactions) {
      this._logger.error('Reactions are not enabled for this room');
      throw new Ably.ErrorInfo('Reactions are not enabled for this room', 40000, 400);
    }

    return this._reactions;
  }

  /**
   * @inheritdoc Room
   */
  get typing(): Typing {
    if (!this._typing) {
      this._logger.error('Typing is not enabled for this room');
      throw new Ably.ErrorInfo('Typing is not enabled for this room', 40000, 400);
    }

    return this._typing;
  }

  /**
   * @inheritdoc Room
   */
  get occupancy(): Occupancy {
    if (!this._occupancy) {
      this._logger.error('Occupancy is not enabled for this room');
      throw new Ably.ErrorInfo('Occupancy is not enabled for this room', 40000, 400);
    }

    return this._occupancy;
  }

  /**
   * @inheritdoc Room
   */
  get status(): RoomStatus {
    return this._lifecycle.status;
  }

  /**
   * @inheritdoc Room
   */
  get error(): Ably.ErrorInfo | undefined {
    return this._lifecycle.error;
  }

  /**
   * @inheritdoc Room
   */
  onStatusChange(listener: RoomStatusListener): OnRoomStatusChangeResponse {
    return this._lifecycle.onChange(listener);
  }

  /**
   * @inheritdoc Room
   */
  offAllStatusChange(): void {
    this._lifecycle.offAll();
  }

  /**
   * @inheritdoc Room
   */
  async attach() {
    this._logger.trace('Room.attach();');
    return this._asyncOpsAfter.then(() => this._lifecycleManager?.attach());
  }

  /**
   * @inheritdoc Room
   */
  async detach(): Promise<void> {
    this._logger.trace('Room.detach();');
    return this._asyncOpsAfter.then(() => this._lifecycleManager?.detach());
  }

  /**
   * Releases resources associated with the room.
   * We guarantee that this does not throw an error.
   */
  release(): Promise<void> {
    this._logger.trace('Room.release();');
    return this._finalizer();
  }

  /**
   * @internal
   *
   * Returns a promise that is resolved when the room is initialized or
   * rejected if the room gets released before initialization.
   */
  initializationStatus(): Promise<void> {
    return this._asyncOpsAfter;
  }

  /**
   * @internal
   *
   * Returns the rooms lifecycle.
   */
  get lifecycle(): InternalRoomLifecycle {
    return this._lifecycle;
  }
}
