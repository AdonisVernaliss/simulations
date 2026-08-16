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

  it('start in a barycentric reference frame', () => {
    for (const preset of presets) {
      const diagnostics = new NBodySimulation(preset.bodies).getDiagnostics();

      expect(Math.hypot(...diagnostics.centerOfMass)).toBeLessThan(1e-9);
      expect(Math.hypot(...diagnostics.linearMomentum)).toBeLessThan(1e-9);
    }
  });

  it('uses physical collision radii and explicit visual profiles for the solar system', () => {
    const solarSystem = presets.find((preset) => preset.id === 'solar-system');
    expect(solarSystem).toBeDefined();

    for (const body of solarSystem!.bodies) {
      expect(body.kind).toBeDefined();
      expect(body.surface).toBeDefined();
      expect(body.renderRadius).toBeGreaterThan(body.radius);
    }

    const earth = solarSystem!.bodies.find((body) => body.id === 'earth');
    expect(earth?.surface).toBe('earth');
    expect(earth?.radius).toBeCloseTo(42.587e-6, 9);
  });

  it('includes black holes as massive participants in shared N-body systems', () => {
    const flyby = presets.find((preset) => preset.id === 'black-hole-flyby');
    expect(flyby).toBeDefined();
    const simulation = new NBodySimulation(flyby!.bodies, {
      gravitationalConstant: 1,
      softening: 0.0001,
    });
    const blackHoleIndex = simulation.kinds.indexOf('black-hole');
    const initialVelocity = simulation.velocities[blackHoleIndex * 3 + 1]!;

    for (let index = 0; index < 100; index += 1) {
      simulation.step(flyby!.fixedStep);
    }

    expect(simulation.kinds[blackHoleIndex]).toBe('black-hole');
    expect(simulation.velocities[blackHoleIndex * 3 + 1]).not.toBeCloseTo(initialVelocity, 8);
  });

  it('includes a collision experiment that conserves mass and momentum while merging', () => {
    const preset = presets.find((candidate) => candidate.id === 'head-on-collision');
    expect(preset).toBeDefined();
    const simulation = new NBodySimulation(preset!.bodies, {
      collisions: true,
      softening: 0.0001,
    });

    for (let index = 0; index < 4_000 && simulation.count > 1; index += 1) {
      simulation.step(preset!.fixedStep);
    }

    expect(simulation.count).toBe(1);
    expect(simulation.masses[0]).toBeCloseTo(2, 12);
    expect(Math.hypot(...simulation.getDiagnostics().linearMomentum)).toBeLessThan(1e-12);
  });
});
