import { describe, expect, it } from 'vitest';

import {
  BOHR_RADIUS_METRES,
  getHydrogenEnergy,
  getHydrogenState,
  probabilityDensity,
  wavefunction,
} from '../src/simulations/atomic-lab/model/hydrogen';
import { sampleOrbital } from '../src/simulations/atomic-lab/model/orbital-sampler';

describe('analytic hydrogen orbitals', () => {
  it('uses the current CODATA Bohr radius', () => {
    expect(BOHR_RADIUS_METRES).toBeCloseTo(5.291_772_105_44e-11, 22);
  });

  it('applies the non-relativistic 1/n² energy scaling', () => {
    expect(getHydrogenEnergy(2)).toBeCloseTo(getHydrogenEnergy(1) / 4, 12);
    expect(getHydrogenEnergy(3)).toBeCloseTo(getHydrogenEnergy(1) / 9, 12);
  });

  it('places the 2s radial node at two Bohr radii', () => {
    const state = getHydrogenState('2s');
    expect(wavefunction(state, 2, 0, 0)).toBeCloseTo(0, 14);
  });

  it('places the 2p z orbital node in the xy plane', () => {
    const state = getHydrogenState('2p-z');
    expect(wavefunction(state, 1, 1, 0)).toBeCloseTo(0, 14);
    expect(Math.abs(wavefunction(state, 0, 0, 1))).toBeGreaterThan(0);
  });

  it('places the 3d z² angular node at 3z² = r²', () => {
    const state = getHydrogenState('3d-z2');
    expect(wavefunction(state, Math.sqrt(2), 0, 1)).toBeCloseTo(0, 14);
  });

  it('returns finite non-negative probability density', () => {
    const state = getHydrogenState('3d-z2');
    for (const point of [[0, 0, 0], [1, 2, 3], [-4, 0.5, 2]] as const) {
      const density = probabilityDensity(state, ...point);
      expect(Number.isFinite(density)).toBe(true);
      expect(density).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('orbital probability sampling', () => {
  it('is deterministic for a fixed seed', () => {
    const state = getHydrogenState('2p-z');
    const first = sampleOrbital(state, 128, 42);
    const second = sampleOrbital(state, 128, 42);

    expect(first.positions).toEqual(second.positions);
    expect(first.phases).toEqual(second.phases);
  });

  it('samples the 1s mean radius close to 1.5 Bohr radii', () => {
    const sample = sampleOrbital(getHydrogenState('1s'), 6_000, 7);
    let radiusSum = 0;
    for (let offset = 0; offset < sample.positions.length; offset += 3) {
      radiusSum += Math.hypot(
        sample.positions[offset] ?? 0,
        sample.positions[offset + 1] ?? 0,
        sample.positions[offset + 2] ?? 0,
      );
    }

    expect(radiusSum / 6_000).toBeGreaterThan(1.35);
    expect(radiusSum / 6_000).toBeLessThan(1.65);
  });

  it('keeps displayed samples within the documented domain', () => {
    const state = getHydrogenState('3d-z2');
    const sample = sampleOrbital(state, 2_000, 99);
    for (let offset = 0; offset < sample.positions.length; offset += 3) {
      expect(
        Math.hypot(
          sample.positions[offset] ?? 0,
          sample.positions[offset + 1] ?? 0,
          sample.positions[offset + 2] ?? 0,
        ),
      ).toBeLessThanOrEqual(state.extent);
    }
  });
});
