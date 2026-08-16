import { describe, expect, it } from 'vitest';

import { CollisionBroadphase } from '../src/simulations/orbital-lab/model/collision-broadphase';

const bruteForceCollision = (
  positions: Float64Array,
  radii: Float64Array,
): readonly [number, number] | undefined => {
  for (let firstIndex = 0; firstIndex < radii.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < radii.length; secondIndex += 1) {
      const firstOffset = firstIndex * 3;
      const secondOffset = secondIndex * 3;
      const deltaX = positions[secondOffset]! - positions[firstOffset]!;
      const deltaY = positions[secondOffset + 1]! - positions[firstOffset + 1]!;
      const deltaZ = positions[secondOffset + 2]! - positions[firstOffset + 2]!;
      const combinedRadius = radii[firstIndex]! + radii[secondIndex]!;
      if (
        deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ <=
        combinedRadius * combinedRadius
      ) {
        return [firstIndex, secondIndex];
      }
    }
  }
  return undefined;
};

describe('collision broad phase', () => {
  it('returns the same first collision as an ordered all-pairs scan', () => {
    const count = 160;
    const positions = new Float64Array(count * 3);
    const radii = new Float64Array(count);
    let seed = 0x12345678;
    const random = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4_294_967_296;
    };

    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset] = (random() - 0.5) * 100;
      positions[offset + 1] = (random() - 0.5) * 100;
      positions[offset + 2] = (random() - 0.5) * 100;
      radii[index] = 0.08 + random() * 0.12;
    }
    positions[12] = positions[9]! + 0.01;
    positions[13] = positions[10]!;
    positions[14] = positions[11]!;

    const broadphase = new CollisionBroadphase({ directThreshold: 0 });
    expect(broadphase.findFirst(positions, radii)).toEqual(
      bruteForceCollision(positions, radii),
    );
    expect(broadphase.algorithm).toBe('sweep-and-prune');
  });

  it('handles touching bodies and highly unequal radii exactly', () => {
    const positions = new Float64Array([0, 0, 0, 10, 0, 0, 12.5, 0, 0]);
    const radii = new Float64Array([0.01, 2, 0.5]);
    const broadphase = new CollisionBroadphase({ directThreshold: 0 });

    expect(broadphase.findFirst(positions, radii)).toEqual([1, 2]);
  });

  it('uses the allocation-free direct scan for small systems', () => {
    const broadphase = new CollisionBroadphase({ directThreshold: 8 });
    expect(
      broadphase.findFirst(new Float64Array([0, 0, 0, 4, 0, 0]), new Float64Array([1, 1])),
    ).toBeUndefined();
    expect(broadphase.algorithm).toBe('direct');
  });
});
