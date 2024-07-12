import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { useCounter } from '../../../src/react/hooks/useCounter.ts';

// Create a test react component that uses the useCounter hook and renders the count
const TestComponent = () => {
  const counter = useCounter();

  return (
    <div>
      <button onClick={counter.increment}>Increment</button>
      <button onClick={counter.decrement}>Decrement</button>
      <p>{'Count :' + counter.count.toString()}</p>
    </div>
  );
};

describe('useCounter', () => {
  it('can do some rendering', () => {
    // Render the counter
    render(<TestComponent />);

    // Check that the count is 0
    expect(screen.findByText('Count: 0')).toBeTruthy();

    // Click the increment button
    screen.getByText('Increment').click();

    // Check that the count is 1
    expect(screen.findByText('Count: 1')).toBeTruthy();

    // Click the decrement button
    screen.getByText('Decrement').click();

    // Check that the count is 0
    expect(screen.findByText('Count: 0')).toBeTruthy();
  });
});
