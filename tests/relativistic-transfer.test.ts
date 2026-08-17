import { describe, expect, it } from 'vitest';

import {
  BOLOMETRIC_DOPPLER_EXPONENT,
  calculateBolometricDopplerBoost,
} from '../src/simulations/orbital-lab/model/relativistic-transfer';

describe('relativistic radiative transfer', () => {
  it('uses the fourth power of the frequency-shift factor for bolometric intensity', () => {
    expect(BOLOMETRIC_DOPPLER_EXPONENT).toBe(4);
    expect(calculateBolometricDopplerBoost(1)).toBe(1);
    expect(calculateBolometricDopplerBoost(1.5)).toBeCloseTo(1.5 ** 4, 12);
    expect(calculateBolometricDopplerBoost(0.5)).toBeCloseTo(0.5 ** 4, 12);
  });

  it('keeps invalid shift factors dark instead of producing non-finite intensity', () => {
    expect(calculateBolometricDopplerBoost(0)).toBe(0);
    expect(calculateBolometricDopplerBoost(Number.NaN)).toBe(0);
  });
});
