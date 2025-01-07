import { PaginatedResult } from 'ably';

import { MessageEvents } from './events';
import { Message } from './message';
import {
  AnyMessageEvent,
  MessageEventPayload,
  MessageListenerObject,
  MessageReaction,
  MessageReactionPayload,
  MessageReactionSummaries,
  MessageReactionSummaryPayload,
} from './message-events';
import { MessageSubscriptionResponse } from './messages';
import { Room } from './room';
import EventEmitter from './utils/event-emitter';

// Snapshots share the same Message[] array to save memory and copy time
// the snapshots themselves are immutable, so they are guaranteed to change
// reference when any message is added, updated or deleted, or reactions changed
export interface Snapshot {
  messages: Message[];
}

interface Subscription {
  unsubscribe(): void;
}

export class MessageWindow implements MessageListenerObject {
  private _snapshot: Snapshot;
  private _emitter = new EventEmitter<{ snapshot: Snapshot }>();

  constructor() {
    this._snapshot = { messages: [] };


    // this.messages = this.messages.bind(this);
    // this.reactions = this.reactions.bind(this);
    // this.summaries = this.summaries.bind(this);
  }

  public subscribe(listener: (snapshot: Snapshot) => void): Subscription {
    listener(this._snapshot); // instantly publish current state on subscribe
    this._emitter.on((snap) => {
      listener(snap);
    });
    return { unsubscribe: () => { this._emitter.off(listener); } };
  }

  public backfillHistory(history: Promise<PaginatedResult<Message> | null>): Promise<void> {
    const p = history.then((result) => {
      if (result === null) {
        return;
      }

      if (result.items.length === 0) {
        return;
      }

      const messages = this._snapshot.messages;
      messages.push(...result.items);

      messages.sort((a, b) => {
        // by serial first, oldest first
        if (a.serial > b.serial) {
          return 1;
        }
        if (a.serial < b.serial) {
          return -1;
        }
        // then by version, newest first
        if (a.version > b.version) {
          return -1;
        }
        if (a.version < b.version) {
          return 1;
        }
        return 0;
      });

      // filter out duplicates
      messages.filter((msg, idx, arr) => {
        if (idx === 0) {
          return true;
        }
        return msg.serial !== (arr[idx - 1]!).serial;
      });

      this._updateSnapshot();
      if (result.hasNext()) {
        return this.backfillHistory(result.next());
      }
    });
    p.catch((error) => {}); // avoid global errors if users don't catch history fetch errors
    return p;
  }

  /**
   * This method is called by room.messages.subscribe. Not part of the public API for this class.
   */
  public messages = (event: MessageEventPayload) => {
    if (event.type === MessageEvents.Created) {
      this._processNewMessage(event);
      return;
    }
    this._processEvent(event);
  };

  /**
   * This method is called by room.messages.subscribe. Not part of the public API for this class.
   */
  public reactions = (event: MessageReactionPayload) => {
    // rely on summaries only, ignore individual reactions
  };

  /**
   * This method is called by room.messages.subscribe. Not part of the public API for this class.
   */
  public summaries = (event: MessageReactionSummaryPayload) => {
    this._processEvent(event);
  };

  private _processNewMessage(event: MessageEventPayload) {
    const message = event.message;
    const idx = this._snapshot.messages.findLastIndex((m) => m.serial === message.serial);
    if (idx !== -1) {
      // message already exists, do nothing
      return;
    }

    const messages = this._snapshot.messages;
    messages.push(message);

    // sort message at the right place
    // (please excuse the `as Message` faff, pleasing the linter)
    for (let i = messages.length - 1; i > 1; i--) {
      if ((messages[i]!).before(messages[i - 1]!)) {
        const temp = messages[i]!;
        messages[i] = messages[i - 1]!;
        messages[i - 1] = temp;
      }
    }

    this._updateSnapshot();
  }

  private _processEvent(event: AnyMessageEvent) {
    const messageSerial = event.messageSerial;
    const idx = this._snapshot.messages.findIndex((m) => m.serial === messageSerial);
    if (idx === -1) {
      // message doesn't exist, if it's an update or delete and within scope, add to list
      if (event.type === MessageEvents.Updated || event.type === MessageEvents.Deleted) {
        event = event as MessageEventPayload;
        if (this._snapshot.messages.length === 0) {
          this._snapshot.messages.push(event.message);
          this._updateSnapshot();
        } else {
          // if the message is newer than the first message in the list, add it
          // use message create processing to ensure it'll be added in the right place
          const firstSerial = this._snapshot.messages[0]?.serial!;
          if (event.messageSerial > firstSerial) {
            this._processNewMessage(event);
          }
        }
      }

      // otherwise do nothing
      return;
    }

    // update message in messages list
    const foundMessage = this._snapshot.messages[idx]!;
    const newMessage = foundMessage.apply(event);

    // if the message has changed, update and publish the new snapshot
    if (newMessage !== foundMessage) {
      this._snapshot.messages[idx] = foundMessage.apply(event);
      this._updateSnapshot();
    }
  }

  // make a new shallow copy of the snapshot object and publish it
  private _updateSnapshot() {
    this._snapshot = { messages: this._snapshot.messages };
    this._emitter.emit('snapshot', this._snapshot);
  }
}
