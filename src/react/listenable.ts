/**
 * Hooks that provide events that can be listened to implement this interface
 * to allow passing a listener when using the hook.
 */
export interface Listenable<T> {
  listener?: T;
}
