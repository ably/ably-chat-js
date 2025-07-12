import { describe, expect, it } from 'vitest';

import EventEmitter, { emitterHasListeners } from '../../../src/core/utils/event-emitter.ts';

interface TestEvents {
  testEvent: { message: string };
  anotherEvent: { value: number };
}

describe('emitterHasListeners', () => {
  it('returns false when no listener is ever added', () => {
    const emitter = new EventEmitter<TestEvents>();

    expect(emitterHasListeners(emitter)).toBe(false);
  });

  it('returns false when there are 0 listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = () => {};

    // Add a listener then remove it
    emitter.on('testEvent', listener);
    emitter.off('testEvent', listener);

    expect(emitterHasListeners(emitter)).toBe(false);
  });

  it('returns true when there is 1 listener', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = () => {};

    emitter.on('testEvent', listener);

    expect(emitterHasListeners(emitter)).toBe(true);
  });

  it('returns true when there are 2 listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = () => {};
    const listener2 = () => {};

    emitter.on('testEvent', listener1);
    emitter.on('anotherEvent', listener2);

    expect(emitterHasListeners(emitter)).toBe(true);
  });

  it('returns true when there are multiple listeners on the same event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = () => {};
    const listener2 = () => {};

    emitter.on('testEvent', listener1);
    emitter.on('testEvent', listener2);

    expect(emitterHasListeners(emitter)).toBe(true);
  });

  it('returns true when there is a listener registered for any event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = () => {};

    emitter.on(listener);

    expect(emitterHasListeners(emitter)).toBe(true);
  });

  it('returns false after removing a listener registered for any event', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = () => {};

    emitter.on(listener);
    emitter.off(listener);

    expect(emitterHasListeners(emitter)).toBe(false);
  });

  it('returns true when there are both event-specific and any-event listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const anyListener = () => {};
    const eventListener = () => {};

    emitter.on(anyListener);
    emitter.on('testEvent', eventListener);

    expect(emitterHasListeners(emitter)).toBe(true);
  });

  it('returns true when there are multiple any-event listeners', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = () => {};
    const listener2 = () => {};

    emitter.on(listener1);
    emitter.on(listener2);

    expect(emitterHasListeners(emitter)).toBe(true);
  });

  it('returns false when all any-event listeners are removed', () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener1 = () => {};
    const listener2 = () => {};

    emitter.on(listener1);
    emitter.on(listener2);
    emitter.off(listener1);
    emitter.off(listener2);

    expect(emitterHasListeners(emitter)).toBe(false);
  });
});
