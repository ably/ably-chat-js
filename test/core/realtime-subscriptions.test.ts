import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { on, once, subscribe } from '../../src/core/realtime-subscriptions.ts';
import { waitForUnsubscribe } from '../helper/realtime-subscriptions.ts';

// Create a mock object that matches the Onable interface
interface MockEmitter<T> {
  on(callback: (data: T) => void): void;
  on(events: string[] | string, callback: (data: T) => void): void;
  once(callback: (data: T) => void): void;
  once(events: string[] | string, callback: (data: T) => void): void;
  off(callback: (data: T) => void): void;
}

// Create a mock object that matches the Subscribable interface
interface MockSubscribable<T> {
  subscribe(callback: (data: T) => void): Promise<void>;
  subscribe(events: string[] | string, callback: (data: T) => void): Promise<void>;
  unsubscribe(callback: (data: T) => void): void;
}

interface TestContext {
  mockEmitter: MockEmitter<string>;
  mockCallback: Mock;
}

interface SubscribableTestContext {
  mockSubscribable: MockSubscribable<string>;
  mockCallback: Mock;
}

vi.mock('ably');

describe('realtime-subscriptions', () => {
  beforeEach<TestContext>((context) => {
    // Create a mock emitter that implements the Onable interface
    context.mockEmitter = {
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
    };
    context.mockCallback = vi.fn();
  });

  describe('on function', () => {
    it<TestContext>('should call on method on the emitter with the provided callback', (context) => {
      const { mockEmitter, mockCallback } = context;

      // Call the on function
      on(mockEmitter, mockCallback);

      // Verify that the emitter's on method was called with the callback
      expect(mockEmitter.on).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should return a cleanup function that calls off method on the emitter', (context) => {
      const { mockEmitter, mockCallback } = context;

      // Call the on function and get the cleanup function
      const cleanup = on(mockEmitter, mockCallback);

      // Verify cleanup is a function
      expect(cleanup).toBeInstanceOf(Function);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(mockEmitter.off).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should work with typed callbacks', (context) => {
      const { mockEmitter } = context;

      // Create a typed callback
      const typedCallback = vi.fn((data: string) => {
        console.log('Received:', data);
      });

      // Call the on function with typed callback
      const cleanup = on(mockEmitter, typedCallback);

      // Verify that the emitter's on method was called with the typed callback
      expect(mockEmitter.on).toHaveBeenCalledWith(typedCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the typed callback
      expect(mockEmitter.off).toHaveBeenCalledWith(typedCallback);
    });

    it<TestContext>('should handle multiple subscriptions independently', (context) => {
      const { mockEmitter } = context;

      // Create multiple callbacks
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      // Subscribe with both callbacks
      const cleanup1 = on(mockEmitter, callback1);
      const cleanup2 = on(mockEmitter, callback2);

      // Verify both callbacks were registered
      expect(mockEmitter.on).toHaveBeenCalledWith(callback1);
      expect(mockEmitter.on).toHaveBeenCalledWith(callback2);
      expect(mockEmitter.on).toHaveBeenCalledTimes(2);

      // Cleanup only the first subscription
      cleanup1();

      // Verify only the first callback was unsubscribed
      expect(mockEmitter.off).toHaveBeenCalledWith(callback1);
      expect(mockEmitter.off).not.toHaveBeenCalledWith(callback2);
      expect(mockEmitter.off).toHaveBeenCalledTimes(1);

      // Cleanup the second subscription
      cleanup2();

      // Verify the second callback was unsubscribed
      expect(mockEmitter.off).toHaveBeenCalledWith(callback2);
      expect(mockEmitter.off).toHaveBeenCalledTimes(2);
    });

    it<TestContext>('should work with number type', () => {
      // Create a mock emitter for numbers
      const numberEmitter: MockEmitter<number> = {
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
      };

      // Create a typed callback for numbers
      const numberCallback = vi.fn((data: number) => {
        console.log('Received number:', data);
      });

      // Call the on function with number-typed callback
      const cleanup = on(numberEmitter, numberCallback);

      // Verify that the emitter's on method was called with the callback
      expect(numberEmitter.on).toHaveBeenCalledWith(numberCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(numberEmitter.off).toHaveBeenCalledWith(numberCallback);
    });

    it<TestContext>('should call on method with single event string and callback', (context) => {
      const { mockEmitter, mockCallback } = context;
      const eventName = 'test-event';

      // Call the on function with specific event
      const cleanup = on(mockEmitter, eventName, mockCallback);

      // Verify that the emitter's on method was called with the event and callback
      expect(mockEmitter.on).toHaveBeenCalledWith(eventName, mockCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(mockEmitter.off).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should call on method with multiple events array and callback', (context) => {
      const { mockEmitter, mockCallback } = context;
      const events = ['event1', 'event2', 'event3'];

      // Call the on function with specific events array
      const cleanup = on(mockEmitter, events, mockCallback);

      // Verify that the emitter's on method was called with the events array and callback
      expect(mockEmitter.on).toHaveBeenCalledWith(events, mockCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(mockEmitter.off).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should handle empty events array', (context) => {
      const { mockEmitter, mockCallback } = context;
      const events: string[] = [];

      // Call the on function with empty events array
      const cleanup = on(mockEmitter, events, mockCallback);

      // Verify that the emitter's on method was called with the empty events array and callback
      expect(mockEmitter.on).toHaveBeenCalledWith(events, mockCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(mockEmitter.off).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should work with typed callbacks for specific events', (context) => {
      const { mockEmitter } = context;
      const eventName = 'typed-event';

      // Create a typed callback
      const typedCallback = vi.fn((data: string) => {
        console.log('Received on event:', eventName, data);
      });

      // Call the on function with specific event and typed callback
      const cleanup = on(mockEmitter, eventName, typedCallback);

      // Verify that the emitter's on method was called with the event and typed callback
      expect(mockEmitter.on).toHaveBeenCalledWith(eventName, typedCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the typed callback
      expect(mockEmitter.off).toHaveBeenCalledWith(typedCallback);
    });

    it('should throw TypeError for invalid arguments', () => {
      const mockEmitter: MockEmitter<string> = {
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
      };

      // Test with invalid arguments (no callback provided)
      expect(() => {
        // @ts-expect-error - Testing invalid arguments
        on(mockEmitter, 'event');
      }).toThrow(TypeError);

      expect(() => {
        // @ts-expect-error - Testing invalid arguments
        on(mockEmitter, ['event1', 'event2']);
      }).toThrow(TypeError);
    });

    it<TestContext>('should handle multiple subscriptions with different event patterns', (context) => {
      const { mockEmitter } = context;

      // Create callbacks for different subscription patterns
      const allEventsCallback = vi.fn();
      const singleEventCallback = vi.fn();
      const multiEventCallback = vi.fn();

      // Subscribe with different patterns
      const cleanup1 = on(mockEmitter, allEventsCallback);
      const cleanup2 = on(mockEmitter, 'single-event', singleEventCallback);
      const cleanup3 = on(mockEmitter, ['event1', 'event2'], multiEventCallback);

      // Verify all subscriptions were made correctly
      expect(mockEmitter.on).toHaveBeenCalledWith(allEventsCallback);
      expect(mockEmitter.on).toHaveBeenCalledWith('single-event', singleEventCallback);
      expect(mockEmitter.on).toHaveBeenCalledWith(['event1', 'event2'], multiEventCallback);
      expect(mockEmitter.on).toHaveBeenCalledTimes(3);

      // Cleanup all subscriptions
      cleanup1();
      cleanup2();
      cleanup3();

      // Verify all callbacks were unsubscribed
      expect(mockEmitter.off).toHaveBeenCalledWith(allEventsCallback);
      expect(mockEmitter.off).toHaveBeenCalledWith(singleEventCallback);
      expect(mockEmitter.off).toHaveBeenCalledWith(multiEventCallback);
      expect(mockEmitter.off).toHaveBeenCalledTimes(3);
    });
  });

  describe('once function', () => {
    it<TestContext>('should call once method on the emitter with the provided callback', (context) => {
      const { mockEmitter, mockCallback } = context;

      // Call the once function
      once(mockEmitter, mockCallback);

      // Verify that the emitter's once method was called with the callback
      expect(mockEmitter.once).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should return a cleanup function that calls off method on the emitter', (context) => {
      const { mockEmitter, mockCallback } = context;

      // Call the once function and get the cleanup function
      const cleanup = once(mockEmitter, mockCallback);

      // Verify cleanup is a function
      expect(cleanup).toBeInstanceOf(Function);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(mockEmitter.off).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should work with typed callbacks', (context) => {
      const { mockEmitter } = context;

      // Create a typed callback
      const typedCallback = vi.fn((data: string) => {
        console.log('Received:', data);
      });

      // Call the once function with typed callback
      const cleanup = once(mockEmitter, typedCallback);

      // Verify that the emitter's once method was called with the typed callback
      expect(mockEmitter.once).toHaveBeenCalledWith(typedCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the typed callback
      expect(mockEmitter.off).toHaveBeenCalledWith(typedCallback);
    });

    it<TestContext>('should handle multiple subscriptions independently', (context) => {
      const { mockEmitter } = context;

      // Create multiple callbacks
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      // Subscribe with both callbacks
      const cleanup1 = once(mockEmitter, callback1);
      const cleanup2 = once(mockEmitter, callback2);

      // Verify both callbacks were registered
      expect(mockEmitter.once).toHaveBeenCalledWith(callback1);
      expect(mockEmitter.once).toHaveBeenCalledWith(callback2);
      expect(mockEmitter.once).toHaveBeenCalledTimes(2);

      // Cleanup only the first subscription
      cleanup1();

      // Verify only the first callback was unsubscribed
      expect(mockEmitter.off).toHaveBeenCalledWith(callback1);
      expect(mockEmitter.off).not.toHaveBeenCalledWith(callback2);
      expect(mockEmitter.off).toHaveBeenCalledTimes(1);

      // Cleanup the second subscription
      cleanup2();

      // Verify the second callback was unsubscribed
      expect(mockEmitter.off).toHaveBeenCalledWith(callback2);
      expect(mockEmitter.off).toHaveBeenCalledTimes(2);
    });

    it<TestContext>('should work with number type', () => {
      // Create a mock emitter for numbers
      const numberEmitter: MockEmitter<number> = {
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
      };

      // Create a typed callback for numbers
      const numberCallback = vi.fn((data: number) => {
        console.log('Received number:', data);
      });

      // Call the once function with number-typed callback
      const cleanup = once(numberEmitter, numberCallback);

      // Verify that the emitter's once method was called with the callback
      expect(numberEmitter.once).toHaveBeenCalledWith(numberCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(numberEmitter.off).toHaveBeenCalledWith(numberCallback);
    });

    it<TestContext>('should call once method with single event string and callback', (context) => {
      const { mockEmitter, mockCallback } = context;
      const eventName = 'test-event';

      // Call the once function with specific event
      const cleanup = once(mockEmitter, eventName, mockCallback);

      // Verify that the emitter's once method was called with the event and callback
      expect(mockEmitter.once).toHaveBeenCalledWith(eventName, mockCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(mockEmitter.off).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should call once method with multiple events array and callback', (context) => {
      const { mockEmitter, mockCallback } = context;
      const events = ['event1', 'event2', 'event3'];

      // Call the once function with specific events array
      const cleanup = once(mockEmitter, events, mockCallback);

      // Verify that the emitter's once method was called with the events array and callback
      expect(mockEmitter.once).toHaveBeenCalledWith(events, mockCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(mockEmitter.off).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should handle empty events array', (context) => {
      const { mockEmitter, mockCallback } = context;
      const events: string[] = [];

      // Call the once function with empty events array
      const cleanup = once(mockEmitter, events, mockCallback);

      // Verify that the emitter's once method was called with the empty events array and callback
      expect(mockEmitter.once).toHaveBeenCalledWith(events, mockCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the callback
      expect(mockEmitter.off).toHaveBeenCalledWith(mockCallback);
    });

    it<TestContext>('should work with typed callbacks for specific events', (context) => {
      const { mockEmitter } = context;
      const eventName = 'typed-event';

      // Create a typed callback
      const typedCallback = vi.fn((data: string) => {
        console.log('Received on event:', eventName, data);
      });

      // Call the once function with specific event and typed callback
      const cleanup = once(mockEmitter, eventName, typedCallback);

      // Verify that the emitter's once method was called with the event and typed callback
      expect(mockEmitter.once).toHaveBeenCalledWith(eventName, typedCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the emitter's off method was called with the typed callback
      expect(mockEmitter.off).toHaveBeenCalledWith(typedCallback);
    });

    it('should throw TypeError for invalid arguments', () => {
      const mockEmitter: MockEmitter<string> = {
        on: vi.fn(),
        once: vi.fn(),
        off: vi.fn(),
      };

      // Test with invalid arguments (no callback provided)
      expect(() => {
        // @ts-expect-error - Testing invalid arguments
        once(mockEmitter, 'event');
      }).toThrow(TypeError);

      expect(() => {
        // @ts-expect-error - Testing invalid arguments
        once(mockEmitter, ['event1', 'event2']);
      }).toThrow(TypeError);
    });

    it<TestContext>('should handle multiple subscriptions with different event patterns', (context) => {
      const { mockEmitter } = context;

      // Create callbacks for different subscription patterns
      const allEventsCallback = vi.fn();
      const singleEventCallback = vi.fn();
      const multiEventCallback = vi.fn();

      // Subscribe with different patterns
      const cleanup1 = once(mockEmitter, allEventsCallback);
      const cleanup2 = once(mockEmitter, 'single-event', singleEventCallback);
      const cleanup3 = once(mockEmitter, ['event1', 'event2'], multiEventCallback);

      // Verify all subscriptions were made correctly
      expect(mockEmitter.once).toHaveBeenCalledWith(allEventsCallback);
      expect(mockEmitter.once).toHaveBeenCalledWith('single-event', singleEventCallback);
      expect(mockEmitter.once).toHaveBeenCalledWith(['event1', 'event2'], multiEventCallback);
      expect(mockEmitter.once).toHaveBeenCalledTimes(3);

      // Cleanup all subscriptions
      cleanup1();
      cleanup2();
      cleanup3();

      // Verify all callbacks were unsubscribed
      expect(mockEmitter.off).toHaveBeenCalledWith(allEventsCallback);
      expect(mockEmitter.off).toHaveBeenCalledWith(singleEventCallback);
      expect(mockEmitter.off).toHaveBeenCalledWith(multiEventCallback);
      expect(mockEmitter.off).toHaveBeenCalledTimes(3);
    });
  });

  describe('subscribe function', () => {
    beforeEach<SubscribableTestContext>((context) => {
      // Create a mock subscribable that implements the Subscribable interface
      context.mockSubscribable = {
        subscribe: vi.fn().mockResolvedValue(void 0),
        unsubscribe: vi.fn(),
      };
      context.mockCallback = vi.fn();
    });

    it<SubscribableTestContext>('should call subscribe method on the subscribable with the provided callback', async (context) => {
      const { mockSubscribable, mockCallback } = context;

      // Call the subscribe function
      const cleanup = subscribe(mockSubscribable, mockCallback);

      // Verify that the subscribable's subscribe method was called with the callback
      expect(mockSubscribable.subscribe).toHaveBeenCalledWith(mockCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the subscribable's unsubscribe method was called with the callback
      await waitForUnsubscribe(mockSubscribable, mockCallback);
    });

    it<SubscribableTestContext>('should call subscribe method with single event string and callback', async (context) => {
      const { mockSubscribable, mockCallback } = context;
      const eventName = 'test-event';

      // Call the subscribe function with specific event
      const cleanup = subscribe(mockSubscribable, eventName, mockCallback);

      // Verify that the subscribable's subscribe method was called with the event and callback
      expect(mockSubscribable.subscribe).toHaveBeenCalledWith(eventName, mockCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the subscribable's unsubscribe method was called with the callback
      await waitForUnsubscribe(mockSubscribable, mockCallback);
    });

    it<SubscribableTestContext>('should call subscribe method with multiple events array and callback', async (context) => {
      const { mockSubscribable, mockCallback } = context;
      const events = ['event1', 'event2', 'event3'];

      // Call the subscribe function with specific events array
      const cleanup = subscribe(mockSubscribable, events, mockCallback);

      // Verify that the subscribable's subscribe method was called with the events array and callback
      expect(mockSubscribable.subscribe).toHaveBeenCalledWith(events, mockCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the subscribable's unsubscribe method was called with the callback
      await waitForUnsubscribe(mockSubscribable, mockCallback);
    });

    it<SubscribableTestContext>('should work with typed callbacks', async (context) => {
      const { mockSubscribable } = context;

      // Create a typed callback
      const typedCallback = vi.fn((data: string) => {
        console.log('Received:', data);
      });

      // Call the subscribe function with typed callback
      const cleanup = subscribe(mockSubscribable, typedCallback);

      // Verify that the subscribable's subscribe method was called with the typed callback
      expect(mockSubscribable.subscribe).toHaveBeenCalledWith(typedCallback);

      // Call the cleanup function
      cleanup();

      // Verify that the subscribable's unsubscribe method was called with the typed callback
      await waitForUnsubscribe(mockSubscribable, typedCallback);
    });

    it<SubscribableTestContext>('should handle multiple subscriptions independently', async (context) => {
      const { mockSubscribable } = context;

      // Create multiple callbacks
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      // Subscribe with both callbacks
      const cleanup1 = subscribe(mockSubscribable, callback1);
      const cleanup2 = subscribe(mockSubscribable, callback2);

      // Verify both callbacks were registered
      expect(mockSubscribable.subscribe).toHaveBeenCalledWith(callback1);
      expect(mockSubscribable.subscribe).toHaveBeenCalledWith(callback2);
      expect(mockSubscribable.subscribe).toHaveBeenCalledTimes(2);

      // Cleanup only the first subscription
      cleanup1();

      // Verify only the first callback was unsubscribed
      await waitForUnsubscribe(mockSubscribable, callback1);
      expect(mockSubscribable.unsubscribe).not.toHaveBeenCalledWith(callback2);
      expect(mockSubscribable.unsubscribe).toHaveBeenCalledTimes(1);

      // Cleanup the second subscription
      cleanup2();

      // Verify the second callback was unsubscribed
      await waitForUnsubscribe(mockSubscribable, callback2);
      expect(mockSubscribable.unsubscribe).toHaveBeenCalledTimes(2);
    });

    it('should throw TypeError for invalid arguments', () => {
      const mockSubscribable: MockSubscribable<string> = {
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
      };

      // Test with invalid arguments (no callback provided)
      expect(() => {
        // @ts-expect-error - Testing invalid arguments
        subscribe(mockSubscribable, 'event');
      }).toThrow(TypeError);

      expect(() => {
        // @ts-expect-error - Testing invalid arguments
        subscribe(mockSubscribable, ['event1', 'event2']);
      }).toThrow(TypeError);
    });

    it<SubscribableTestContext>('should handle multiple subscriptions with different event patterns', async (context) => {
      const { mockSubscribable } = context;

      // Create callbacks for different subscription patterns
      const allEventsCallback = vi.fn();
      const singleEventCallback = vi.fn();
      const multiEventCallback = vi.fn();

      // Subscribe with different patterns
      const cleanup1 = subscribe(mockSubscribable, allEventsCallback);
      const cleanup2 = subscribe(mockSubscribable, 'single-event', singleEventCallback);
      const cleanup3 = subscribe(mockSubscribable, ['event1', 'event2'], multiEventCallback);

      // Verify all subscriptions were made correctly
      expect(mockSubscribable.subscribe).toHaveBeenCalledWith(allEventsCallback);
      expect(mockSubscribable.subscribe).toHaveBeenCalledWith('single-event', singleEventCallback);
      expect(mockSubscribable.subscribe).toHaveBeenCalledWith(['event1', 'event2'], multiEventCallback);
      expect(mockSubscribable.subscribe).toHaveBeenCalledTimes(3);

      // Cleanup all subscriptions
      cleanup1();
      cleanup2();
      cleanup3();

      // Verify all callbacks were unsubscribed
      await waitForUnsubscribe(mockSubscribable, allEventsCallback);
      await waitForUnsubscribe(mockSubscribable, singleEventCallback);
      await waitForUnsubscribe(mockSubscribable, multiEventCallback);
      expect(mockSubscribable.unsubscribe).toHaveBeenCalledTimes(3);
    });
  });
});
