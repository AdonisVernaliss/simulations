import { describe, expect, it } from 'vitest';

import {
  AdaptiveGravitySolver,
  computeDirectAccelerations,
  selectGravityAlgorithm,
} from '../src/simulations/orbital-lab/model/gravity-solver';

const createDeterministicSystem = (count: number): {
  positions: Float64Array;
  masses: Float64Array;
} => {
  const positions = new Float64Array(count * 3);
  const masses = new Float64Array(count);
  let seed = 0x6d2b79f5;
  const random = (): number => {
    seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4_294_967_296;
  };

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions[offset] = (random() - 0.5) * 20;
    positions[offset + 1] = (random() - 0.5) * 20;
    positions[offset + 2] = (random() - 0.5) * 20;
    masses[index] = 0.05 + random() * 2;
  }

  return { positions, masses };
};

describe('gravity solvers', () => {
  it('computes the exact symmetric two-body acceleration', () => {
    const target = new Float64Array(6);
    computeDirectAccelerations(
      new Float64Array([-1, 0, 0, 1, 0, 0]),
      new Float64Array([1, 2]),
      1,
      0,
      target,
    );

    expect(Array.from(target)).toEqual([
      expect.closeTo(0.5, 14),
      0,
      0,
      expect.closeTo(-0.25, 14),
      0,
      0,
    ]);
  });

  it('keeps small systems exact and selects the tree only above its crossover', () => {
    expect(selectGravityAlgorithm(256, 256)).toBe('direct');
    expect(selectGravityAlgorithm(257, 256)).toBe('barnes-hut');
  });

  it('bounds Barnes-Hut force error while removing center-of-mass acceleration', () => {
    const { positions, masses } = createDeterministicSystem(320);
    const exact = new Float64Array(positions.length);
    const approximate = new Float64Array(positions.length);
    computeDirectAccelerations(positions, masses, 1, 0.001, exact);
    const solver = new AdaptiveGravitySolver({
      directThreshold: 0,
    });
    solver.compute(positions, masses, 1, 0.001, approximate);

    let squaredError = 0;
    let squaredReference = 0;
    let momentumDerivativeX = 0;
    let momentumDerivativeY = 0;
    let momentumDerivativeZ = 0;
    for (let index = 0; index < masses.length; index += 1) {
      const offset = index * 3;
      for (let component = 0; component < 3; component += 1) {
        const difference = approximate[offset + component]! - exact[offset + component]!;
        squaredError += difference * difference;
        squaredReference += exact[offset + component]! ** 2;
      }
      momentumDerivativeX += masses[index]! * approximate[offset]!;
      momentumDerivativeY += masses[index]! * approximate[offset + 1]!;
      momentumDerivativeZ += masses[index]! * approximate[offset + 2]!;
    }

    expect(Math.sqrt(squaredError / squaredReference)).toBeLessThan(0.003);
    expect(Math.hypot(momentumDerivativeX, momentumDerivativeY, momentumDerivativeZ)).toBeLessThan(
      1e-10,
    );
  });

  it('remains finite for coincident bodies', () => {
    const positions = new Float64Array(900);
    const masses = new Float64Array(300).fill(1);
    const target = new Float64Array(positions.length);
    const solver = new AdaptiveGravitySolver({ directThreshold: 0 });

    solver.compute(positions, masses, 1, 0.001, target);

    expect(Array.from(target).every(Number.isFinite)).toBe(true);
  });

  it('rejects invalid adaptive thresholds and opening angles', () => {
    expect(() => new AdaptiveGravitySolver({ directThreshold: Number.NaN })).toThrow(
      RangeError,
    );
    expect(() => new AdaptiveGravitySolver({ openingAngle: 0 })).toThrow(RangeError);
  });
});
