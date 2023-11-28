import { Realtime } from 'ably/promises';

export class Chat {
  private ably: Realtime;
  constructor(ably: Realtime) {
    this.ably = ably;
  }
}
