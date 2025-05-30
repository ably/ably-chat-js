/**
 * Interface for features that have resources that need to be disposed of when a room is released.
 */
export interface Disposable {
  /**
   * Disposes of resources associated with the feature.
   */
  dispose(): void;
}
