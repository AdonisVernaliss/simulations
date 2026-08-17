import { describe, expect, it } from 'vitest';

import { createTidalDisruptionLayout } from '../src/simulations/orbital-lab/renderer/tidal-disruption-layout';

describe('tidal disruption tracer layout', () => {
  it('creates deterministic balanced leading and trailing streams', () => {
    const first = createTidalDisruptionLayout(240);
    const second = createTidalDisruptionLayout(240);

    expect(first.positions).toEqual(second.positions);
    expect(first.sides).toEqual(second.sides);
    expect(first.positions).toHaveLength(240 * 3);
    expect(first.sides.reduce((sum, side) => sum + side, 0)).toBe(0);
  });

  it('keeps the cold layout narrow compared with its longitudinal extent', () => {
    const layout = createTidalDisruptionLayout(240);
    let maximumLongitudinal = 0;
    let maximumTransverse = 0;

    for (let index = 0; index < layout.sides.length; index += 1) {
      const offset = index * 3;
      maximumLongitudinal = Math.max(maximumLongitudinal, Math.abs(layout.positions[offset]!));
      maximumTransverse = Math.max(
        maximumTransverse,
        Math.hypot(layout.positions[offset + 1]!, layout.positions[offset + 2]!),
      );
    }

    expect(maximumLongitudinal).toBeGreaterThan(6);
    expect(maximumTransverse).toBeLessThan(0.75);
  });
});
