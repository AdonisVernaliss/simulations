import { describe, expect, it } from 'vitest';

import { NBodySimulation } from '../src/simulations/orbital-lab/model/n-body';
import { presets } from '../src/simulations/orbital-lab/model/presets';

describe('orbital presets', () => {
  it('use unique preset and body identifiers', () => {
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);

    for (const preset of presets) {
      expect(new Set(preset.bodies.map((body) => body.id)).size).toBe(preset.bodies.length);
    }
  });

  it('remain finite during an initial integration window', () => {
    for (const preset of presets) {
      const simulation = new NBodySimulation(preset.bodies, { softening: 0.0001 });

      for (let index = 0; index < 500; index += 1) {
        simulation.step(preset.fixedStep);
      }

      expect(Array.from(simulation.positions).every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(simulation.getDiagnostics().totalEnergy)).toBe(true);
    }
  });
});
