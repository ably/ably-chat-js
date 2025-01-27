import { PaginatedResult } from 'ably';

import { MessageEvents } from './events';
import { Message } from './message';
import {
  MessageEvent,
  MessageReaction,
  MessageReactionEvent,
  MessageReactionSummaries,
  MessageReactionSummaryEvent,
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

export class MessageWindow {
  private _snapshot: Snapshot;
  private _emitter = new EventEmitter<{ snapshot: Snapshot }>();

  constructor() {
    this._snapshot = { messages: [] };
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
  public messagesListener = (event: MessageEvent) => {
    if (event.type === MessageEvents.Created) {
      this._processNewMessage(event);
      return;
    }
    // update or delete events
    this._updateAtSerial(event.message.serial, event);
  };

  /**
   * This method is called by room.messages.subscribe. Not part of the public API for this class.
   */
  public summariesListener = (event: MessageReactionSummaryEvent) => {
    const serial = event.summary.refSerial;
    this._updateAtSerial(serial, event);
  };

  private _updateAtSerial(serial : string, event : MessageReactionSummaryEvent | MessageEvent) {
    const idx = this._snapshot.messages.findIndex((m) => m.serial === serial);
    if (idx === -1) {
      // message doesn't exist, do nothing
      return;
    }

    // update message in messages list
    const foundMessage = this._snapshot.messages[idx]!;
    const newMessage = foundMessage.with(event);

    // if the message has changed, update and publish the new snapshot
    if (newMessage !== foundMessage) {
      this._snapshot.messages[idx] = foundMessage.with(event);
      this._updateSnapshot();
    }

  }

  private _processNewMessage(event: MessageEvent) {
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

  // make a new shallow copy of the snapshot object and publish it
  private _updateSnapshot() {
    this._snapshot = { messages: this._snapshot.messages };
    this._emitter.emit('snapshot', this._snapshot);
  }
}
