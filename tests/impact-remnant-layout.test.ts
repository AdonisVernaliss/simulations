import { describe, expect, it } from 'vitest';

import { createImpactDebrisLayout } from '../src/simulations/orbital-lab/renderer/impact-remnant-layout';

describe('post-impact debris layout', () => {
  it('creates a deterministic flattened bound debris distribution', () => {
    const first = createImpactDebrisLayout(320);
    const second = createImpactDebrisLayout(320);

    expect(first.positions).toEqual(second.positions);
    expect(first.positions).toHaveLength(320 * 3);
    expect(first.temperatures).toHaveLength(320);

    let heightSum = 0;
    for (let index = 0; index < 320; index += 1) {
      const offset = index * 3;
      const x = first.positions[offset]!;
      const y = first.positions[offset + 1]!;
      const z = first.positions[offset + 2]!;
      const radius = Math.hypot(x, z);
      expect(radius).toBeGreaterThanOrEqual(1.3);
      expect(radius).toBeLessThanOrEqual(3.65);
      expect(first.temperatures[index]).toBeGreaterThanOrEqual(0);
      expect(first.temperatures[index]).toBeLessThanOrEqual(1);
      heightSum += Math.abs(y);
    }

    expect(heightSum / 320).toBeLessThan(0.22);
  });
});
