import { describe, expect, it } from 'vitest';

import { NBodySimulation } from '../src/simulations/orbital-lab/model/n-body';
import {
  AU_SOLAR_MASS_TIME_UNIT_SECONDS,
  presets,
} from '../src/simulations/orbital-lab/model/presets';
import { calculateTidalStressRatio } from '../src/simulations/orbital-lab/model/tidal-stress';

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

  it('keep every current interactive preset on exact direct gravity', () => {
    for (const preset of presets) {
      const simulation = new NBodySimulation(preset.bodies);
      expect(simulation.gravityAlgorithm).toBe('direct');
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

  it('includes active, neutron-star, and pulsar systems as massive shared-scene objects', () => {
    const accreting = presets.find((preset) => preset.id === 'accreting-black-hole');
    const quasar = presets.find((preset) => preset.id === 'quasar-system');
    const pulsarSystem = presets.find((preset) => preset.id === 'pulsar-system');
    const neutronBinary = presets.find((preset) => preset.id === 'neutron-star-binary');
    const activeNucleus = quasar?.bodies.find((body) => body.surface === 'quasar');
    const accretingPrimary = accreting?.bodies.find(
      (body) => body.surface === 'accretion-disk',
    );
    const pulsar = pulsarSystem?.bodies.find((body) => body.kind === 'pulsar');

    expect(activeNucleus?.kind).toBe('black-hole');
    expect(accretingPrimary?.kind).toBe('black-hole');
    expect(accretingPrimary!.radius / accretingPrimary!.mass).toBeCloseTo(0.02, 12);
    expect(activeNucleus!.radius / activeNucleus!.mass).toBeCloseTo(0.02, 12);
    expect(pulsar?.mass).toBeGreaterThan(1);
    expect(
      (Math.PI * 2 * AU_SOLAR_MASS_TIME_UNIT_SECONDS) / pulsar!.rotationRate!,
    ).toBeCloseTo(1.337, 9);
    expect(neutronBinary?.bodies.every((body) => body.kind === 'neutron-star')).toBe(true);
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

  it('includes a close encounter that reaches strong black-hole tides', () => {
    const preset = presets.find((candidate) => candidate.id === 'tidal-encounter');
    expect(preset).toBeDefined();
    const simulation = new NBodySimulation(preset!.bodies, { softening: 0.0001 });
    const blackHoleIndex = simulation.kinds.indexOf('black-hole');
    const starIndex = simulation.kinds.indexOf('star');
    let strongestRatio = 0;

    for (let index = 0; index < 4_000; index += 1) {
      simulation.step(preset!.fixedStep);
      const blackHoleOffset = blackHoleIndex * 3;
      const starOffset = starIndex * 3;
      const separation = Math.hypot(
        simulation.positions[blackHoleOffset]! - simulation.positions[starOffset]!,
        simulation.positions[blackHoleOffset + 1]! - simulation.positions[starOffset + 1]!,
        simulation.positions[blackHoleOffset + 2]! - simulation.positions[starOffset + 2]!,
      );
      strongestRatio = Math.max(
        strongestRatio,
        calculateTidalStressRatio(
          simulation.masses[blackHoleIndex]!,
          simulation.masses[starIndex]!,
          simulation.radii[starIndex]!,
          separation,
        ),
      );
    }

    expect(strongestRatio).toBeGreaterThan(0.8);
  });

  it('provides a reproducible preset for every collision visual regime', () => {
    const eventPresets = [
      ['head-on-collision', 'planetary-impact'],
      ['stellar-merger', 'stellar-merger'],
      ['tidal-encounter', 'tidal-disruption'],
      ['horizon-capture', 'horizon-capture'],
      ['black-hole-merger', 'compact-merger'],
    ] as const;

    for (const [presetId, visualClass] of eventPresets) {
      const preset = presets.find((candidate) => candidate.id === presetId);
      expect(preset, `${presetId} preset`).toBeDefined();
      const simulation = new NBodySimulation(preset!.bodies, {
        collisions: true,
        softening: 0.0001,
      });

      for (
        let index = 0;
        index < 8_000 && simulation.lastCollisionEvent === undefined;
        index += 1
      ) {
        simulation.step(preset!.fixedStep);
      }

      expect(simulation.lastCollisionEvent?.visualClass, presetId).toBe(visualClass);
    }
  });
});
