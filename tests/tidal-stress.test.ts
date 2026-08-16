import { describe, expect, it } from 'vitest';

import { calculateTidalStressRatio } from '../src/simulations/orbital-lab/model/tidal-stress';

describe('tidal stress', () => {
  it('compares the leading tidal gradient with surface self-gravity', () => {
    expect(calculateTidalStressRatio(8, 1, 0.2, 0.4)).toBeCloseTo(2, 12);
  });

  it('follows the inverse-cube separation law', () => {
    const near = calculateTidalStressRatio(6, 1, 0.1, 0.5);
    const far = calculateTidalStressRatio(6, 1, 0.1, 1);
    expect(near / far).toBeCloseTo(8, 12);
  });

  it('returns zero outside its physical domain', () => {
    expect(calculateTidalStressRatio(0, 1, 0.1, 1)).toBe(0);
    expect(calculateTidalStressRatio(1, 1, 0.1, 0)).toBe(0);
  });
});
