import { describe, expect, it } from 'vitest';

import { AU_SOLAR_MASS_TIME_UNIT_SECONDS } from '../src/simulations/orbital-lab/model/presets';
import {
  modelTimeToPhysicalSeconds,
  physicalWarpToModelRate,
} from '../src/simulations/orbital-lab/model/time-scale';

describe('physical time warp', () => {
  it('maps real time and accelerated time into normalized integration units', () => {
    expect(physicalWarpToModelRate(1, AU_SOLAR_MASS_TIME_UNIT_SECONDS)).toBeCloseTo(
      1 / AU_SOLAR_MASS_TIME_UNIT_SECONDS,
      16,
    );
    expect(
      physicalWarpToModelRate(1_000_000, AU_SOLAR_MASS_TIME_UNIT_SECONDS),
    ).toBeCloseTo(0.199098, 5);
  });

  it('round-trips elapsed model time into physical seconds', () => {
    const rate = physicalWarpToModelRate(86_400, AU_SOLAR_MASS_TIME_UNIT_SECONDS);
    expect(modelTimeToPhysicalSeconds(rate, AU_SOLAR_MASS_TIME_UNIT_SECONDS)).toBeCloseTo(
      86_400,
      9,
    );
  });

  it('rejects invalid scales', () => {
    expect(() => physicalWarpToModelRate(-1, 10)).toThrow(RangeError);
    expect(() => physicalWarpToModelRate(1, 0)).toThrow(RangeError);
    expect(() => modelTimeToPhysicalSeconds(Number.NaN, 10)).toThrow(RangeError);
  });
});
