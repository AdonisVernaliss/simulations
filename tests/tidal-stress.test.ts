import { describe, expect, it } from 'vitest';

import {
  calculateAffineTidalAxes,
  calculateTidalStressRatio,
  NEWTONIAN_TIDAL_EIGENVALUE_RATIO,
} from '../src/simulations/orbital-lab/model/tidal-stress';

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

  it('uses a trace-free radial-stretch and transverse-compression tidal tensor', () => {
    expect(NEWTONIAN_TIDAL_EIGENVALUE_RATIO).toEqual([2, -1, -1]);
    expect(NEWTONIAN_TIDAL_EIGENVALUE_RATIO.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it('maps stress to a bounded volume-preserving affine ellipsoid', () => {
    const relaxed = calculateAffineTidalAxes(0);
    const moderate = calculateAffineTidalAxes(0.5);
    const disruption = calculateAffineTidalAxes(1);
    const deep = calculateAffineTidalAxes(5);

    expect(relaxed).toEqual({ longitudinal: 1, transverse: 1 });
    expect(moderate.longitudinal).toBeGreaterThan(1);
    expect(disruption.longitudinal).toBeGreaterThan(moderate.longitudinal);
    expect(deep.longitudinal).toBeGreaterThan(disruption.longitudinal);
    expect(deep.longitudinal).toBeLessThanOrEqual(6.5);

    for (const axes of [moderate, disruption, deep]) {
      expect(axes.longitudinal * axes.transverse ** 2).toBeCloseTo(1, 12);
    }
  });
});
