import { describe, expect, it } from 'vitest';

import { calculateSchwarzschildLensScales } from '../src/simulations/orbital-lab/renderer/gravitational-lensing';

describe('Schwarzschild screen-space lens scale', () => {
  it('implements the background-source Einstein angle relation', () => {
    const radius = 0.04;
    const distance = 5;
    const fieldOfView = 42;
    const halfField = Math.tan((fieldOfView * Math.PI) / 360);
    const scales = calculateSchwarzschildLensScales(radius, 0.17, distance, fieldOfView);

    expect(scales.strength).toBeCloseTo(radius / (2 * distance * halfField ** 2), 12);
  });

  it('weakens with observer distance while retaining a separate display shadow', () => {
    const near = calculateSchwarzschildLensScales(0.04, 0.17, 5, 42);
    const far = calculateSchwarzschildLensScales(0.04, 0.17, 10, 42);

    expect(far.strength).toBeCloseTo(near.strength / 2, 12);
    expect(far.visibleShadowRadius).toBeCloseTo(near.visibleShadowRadius / 2, 12);
    expect(near.visibleShadowRadius).toBeGreaterThan(
      calculateSchwarzschildLensScales(0.04, 0.04, 5, 42).visibleShadowRadius,
    );
  });
});
