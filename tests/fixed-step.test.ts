import { describe, expect, it, vi } from 'vitest';

import { FixedStepClock } from '../src/core/fixed-step';

describe('FixedStepClock', () => {
  it('turns elapsed time into deterministic fixed steps', () => {
    const clock = new FixedStepClock(0.01);
    const step = vi.fn();

    const first = clock.advance(0.025, 1, step);
    const second = clock.advance(0.005, 1, step);

    expect(first.steps).toBe(2);
    expect(first.interpolation).toBeCloseTo(0.5, 12);
    expect(second.steps).toBe(1);
    expect(step).toHaveBeenCalledTimes(3);
    expect(step).toHaveBeenLastCalledWith(0.01);
  });

  it('caps catch-up work after a delayed frame', () => {
    const clock = new FixedStepClock(0.01, 5);
    const step = vi.fn();

    const result = clock.advance(1, 1, step);

    expect(result.steps).toBe(5);
    expect(result.droppedTime).toBeCloseTo(0.95, 12);
  });

  it('supports pausing without accumulating a backlog', () => {
    const clock = new FixedStepClock(0.01);
    const step = vi.fn();

    clock.advance(10, 0, step);
    const result = clock.advance(0.01, 1, step);

    expect(result.steps).toBe(1);
    expect(step).toHaveBeenCalledTimes(1);
  });
});
