import { describe, expect, it } from 'vitest';

import { createPulsarMagnetosphereLayout } from '../src/simulations/orbital-lab/renderer/pulsar-magnetosphere';

describe('pulsar magnetosphere geometry', () => {
  it('samples closed field lines from the dipole relation r = L sin²(theta)', () => {
    const layout = createPulsarMagnetosphereLayout();
    const shells = [1.55, 2.1, 2.75];

    expect(layout.closedField.length).toBeGreaterThan(1_000);
    for (let offset = 0; offset < layout.closedField.length; offset += 3) {
      const x = layout.closedField[offset]!;
      const y = layout.closedField[offset + 1]!;
      const z = layout.closedField[offset + 2]!;
      const radius = Math.hypot(x, y, z);
      const sineSquared = 1 - (y / radius) ** 2;
      const shell = radius / Math.max(sineSquared, Number.EPSILON);
      expect(Math.min(...shells.map((candidate) => Math.abs(candidate - shell)))).toBeLessThan(
        2e-5,
      );
    }
  });

  it('opens polar lines beyond the light cylinder and keeps a finite current sheet', () => {
    const layout = createPulsarMagnetosphereLayout();
    const openRadii: number[] = [];

    for (let offset = 0; offset < layout.openField.length; offset += 3) {
      openRadii.push(
        Math.hypot(
          layout.openField[offset]!,
          layout.openField[offset + 1]!,
          layout.openField[offset + 2]!,
        ),
      );
    }

    expect(Math.max(...openRadii)).toBeGreaterThan(4.5);
    expect(Array.from(layout.currentSheet).every(Number.isFinite)).toBe(true);
    expect(layout.currentSheet.length).toBeGreaterThan(400);
  });
});
