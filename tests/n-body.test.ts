import { describe, expect, it } from 'vitest';

import { NBodySimulation } from '../src/simulations/orbital-lab/model/n-body';
import type { BodyDefinition } from '../src/simulations/orbital-lab/model/types';

const createBinarySystem = (): NBodySimulation => {
  const bodies: BodyDefinition[] = [
    {
      id: 'primary',
      name: 'Primary',
      mass: 1,
      radius: 0.08,
      color: '#ffd27a',
      position: [-1, 0, 0],
      velocity: [0, -0.5, 0],
    },
    {
      id: 'secondary',
      name: 'Secondary',
      mass: 1,
      radius: 0.08,
      color: '#7ab8ff',
      position: [1, 0, 0],
      velocity: [0, 0.5, 0],
    },
  ];

  return new NBodySimulation(bodies, {
    gravitationalConstant: 1,
    softening: 0.0001,
  });
};

describe('NBodySimulation', () => {
  it('keeps an equal-mass binary system on a closed orbit', () => {
    const simulation = createBinarySystem();
    const period = 4 * Math.PI;
    const steps = 4_000;

    for (let index = 0; index < steps; index += 1) {
      simulation.step(period / steps);
    }

    expect(simulation.positions[0]).toBeCloseTo(-1, 4);
    expect(simulation.positions[1]).toBeCloseTo(0, 4);
    expect(simulation.positions[3]).toBeCloseTo(1, 4);
    expect(simulation.positions[4]).toBeCloseTo(0, 4);
  });

  it('limits energy drift over repeated orbits', () => {
    const simulation = createBinarySystem();
    const initialEnergy = simulation.getDiagnostics().totalEnergy;
    const period = 4 * Math.PI;
    const steps = 20_000;

    for (let index = 0; index < steps; index += 1) {
      simulation.step((period * 5) / steps);
    }

    const finalEnergy = simulation.getDiagnostics().totalEnergy;
    const relativeDrift = Math.abs((finalEnergy - initialEnergy) / initialEnergy);

    expect(relativeDrift).toBeLessThan(1e-6);
  });

  it('preserves total linear momentum', () => {
    const simulation = createBinarySystem();

    for (let index = 0; index < 2_000; index += 1) {
      simulation.step(0.002);
    }

    expect(simulation.getDiagnostics().linearMomentum).toEqual([
      expect.closeTo(0, 10),
      expect.closeTo(0, 10),
      expect.closeTo(0, 10),
    ]);
  });

  it('allows the Barnes-Hut path to be selected without changing the integrator', () => {
    const bodies: BodyDefinition[] = Array.from({ length: 24 }, (_, index) => ({
      id: `tree-${index}`,
      name: `Tree body ${index}`,
      mass: 0.1 + index * 0.01,
      radius: 0.001,
      color: '#ffffff',
      position: [Math.cos(index) * (2 + index * 0.03), Math.sin(index) * 2, index * 0.01],
      velocity: [0, 0, 0],
    }));
    const simulation = new NBodySimulation(bodies, {
      gravitationalConstant: 1,
      softening: 0.001,
      gravitySolver: 'barnes-hut',
    });

    simulation.step(0.001);

    expect(simulation.gravityAlgorithm).toBe('barnes-hut');
    expect(Array.from(simulation.positions).every(Number.isFinite)).toBe(true);
  });

  it('merges colliding bodies while conserving mass and momentum', () => {
    const simulation = new NBodySimulation(
      [
        {
          id: 'left',
          name: 'Left',
          mass: 2,
          radius: 0.2,
          color: '#ffffff',
          position: [-0.1, 0, 0],
          velocity: [1, 0, 0],
        },
        {
          id: 'right',
          name: 'Right',
          mass: 1,
          radius: 0.2,
          color: '#999999',
          position: [0.1, 0, 0],
          velocity: [-2, 0, 0],
        },
      ],
      {
        collisions: true,
        gravitationalConstant: 0,
      },
    );

    simulation.step(0.001);

    expect(simulation.count).toBe(1);
    expect(simulation.masses[0]).toBe(3);
    expect(simulation.velocities[0]).toBeCloseTo(0, 12);
    expect(simulation.radii[0]).toBeCloseTo(Math.cbrt(0.2 ** 3 * 2), 12);
  });

  it('uses the exact sweep broad phase for larger collision sets', () => {
    const bodies: BodyDefinition[] = Array.from({ length: 60 }, (_, index) => ({
      id: `collision-set-${index}`,
      name: `Collision set ${index}`,
      mass: 1,
      radius: 0.1,
      color: '#ffffff',
      position: [index === 1 ? 0.1 : index * 10, 0, 0],
      velocity: [0, 0, 0],
    }));
    const simulation = new NBodySimulation(bodies, {
      collisions: true,
      gravitationalConstant: 0,
    });

    simulation.step(0.001);

    expect(simulation.collisionAlgorithm).toBe('sweep-and-prune');
    expect(simulation.count).toBe(59);
    expect(simulation.lastCollisionEvent?.participants).toEqual([
      'collision-set-0',
      'collision-set-1',
    ]);
  });

  it('keeps physical radii separate from render scale and appearance metadata', () => {
    const simulation = new NBodySimulation([
      {
        id: 'earth',
        name: 'Earth',
        kind: 'terrestrial',
        surface: 'earth',
        mass: 1,
        radius: 0.000_042_6,
        renderRadius: 0.08,
        color: '#6ca9ff',
        axialTilt: 0.409,
        rotationRate: 6.3,
        position: [0, 0, 0],
        velocity: [0, 0, 0],
      },
    ]);

    expect(simulation.radii[0]).toBeCloseTo(0.000_042_6, 12);
    expect(simulation.renderRadii[0]).toBeCloseTo(0.08, 12);
    expect(simulation.kinds[0]).toBe('terrestrial');
    expect(simulation.surfaces[0]).toBe('earth');
    expect(simulation.axialTilts[0]).toBeCloseTo(0.409, 12);
    expect(simulation.rotationRates[0]).toBeCloseTo(6.3, 12);
  });

  it('marks an ordinary merged body as a hot impact remnant', () => {
    const simulation = new NBodySimulation(
      [
        {
          id: 'target',
          name: 'Target',
          kind: 'terrestrial',
          surface: 'earth',
          mass: 4,
          radius: 0.2,
          renderRadius: 0.3,
          color: '#4477aa',
          position: [-0.1, 0, 0],
          velocity: [0, 0, 0],
        },
        {
          id: 'projectile',
          name: 'Projectile',
          kind: 'rocky',
          surface: 'mars',
          mass: 1,
          radius: 0.1,
          renderRadius: 0.15,
          color: '#aa5533',
          position: [0.1, 0, 0],
          velocity: [0, 0, 0],
        },
      ],
      { collisions: true, gravitationalConstant: 0 },
    );

    simulation.step(0.001);

    expect(simulation.count).toBe(1);
    expect(simulation.kinds[0]).toBe('terrestrial');
    expect(simulation.surfaces[0]).toBe('molten');
    expect(simulation.renderRadii[0]).toBeCloseTo(Math.cbrt(0.3 ** 3 + 0.15 ** 3), 12);
  });

  it('adds a body without resetting elapsed simulation time', () => {
    const simulation = createBinarySystem();
    simulation.step(0.01);

    simulation.addBody({
      id: 'visitor',
      name: 'Visitor',
      mass: 0.01,
      radius: 0.03,
      color: '#ffffff',
      position: [0, 2, 0],
      velocity: [-0.5, 0, 0],
    });

    expect(simulation.count).toBe(3);
    expect(simulation.ids).toContain('visitor');
    expect(simulation.positions).toHaveLength(9);
    expect(simulation.time).toBeCloseTo(0.01, 12);
  });

  it('resolves a fast grazing impact as hit-and-run without losing momentum', () => {
    const simulation = new NBodySimulation(
      [
        {
          id: 'grazing-a',
          name: 'Grazing A',
          mass: 1,
          radius: 0.2,
          color: '#ffffff',
          position: [-0.19, 0, 0],
          velocity: [0.5, 2, 0],
        },
        {
          id: 'grazing-b',
          name: 'Grazing B',
          mass: 1,
          radius: 0.2,
          color: '#999999',
          position: [0.19, 0, 0],
          velocity: [-0.5, -2, 0],
        },
      ],
      { collisions: true, gravitationalConstant: 1 },
    );

    simulation.step(0.0001);

    expect(simulation.count).toBe(2);
    expect(simulation.lastCollisionEvent?.outcome).toBe('hit-and-run');
    expect(Math.hypot(...simulation.getDiagnostics().linearMomentum)).toBeLessThan(1e-12);
  });

  it('does not invent resolved fragments without hydrodynamics', () => {
    const simulation = new NBodySimulation(
      [
        {
          id: 'fast-a',
          name: 'Fast A',
          kind: 'rocky',
          mass: 1,
          radius: 0.2,
          renderRadius: 0.2,
          color: '#ffffff',
          position: [-0.19, 0, 0],
          velocity: [6, 0, 0],
        },
        {
          id: 'fast-b',
          name: 'Fast B',
          kind: 'rocky',
          mass: 1,
          radius: 0.2,
          renderRadius: 0.2,
          color: '#999999',
          position: [0.19, 0, 0],
          velocity: [-6, 0, 0],
        },
      ],
      { collisions: true, gravitationalConstant: 1 },
    );

    simulation.step(0.0001);

    expect(simulation.lastCollisionEvent?.outcome).toBe('disruption');
    expect(simulation.count).toBe(2);
    expect(simulation.lastCollisionEvent?.fragmentCount).toBe(0);
    expect(Array.from(simulation.masses).reduce((sum, mass) => sum + mass, 0)).toBeCloseTo(2, 12);
    expect(Math.hypot(...simulation.getDiagnostics().linearMomentum)).toBeLessThan(1e-10);
  });

  it('captures an intersecting body without changing the black-hole identity', () => {
    const simulation = new NBodySimulation(
      [
        {
          id: 'hole',
          name: 'Black hole',
          kind: 'black-hole',
          surface: 'none',
          mass: 5,
          radius: 0.2,
          renderRadius: 0.3,
          color: '#ff9955',
          position: [0, 0, 0],
          velocity: [0, 0, 0],
        },
        {
          id: 'world',
          name: 'World',
          kind: 'terrestrial',
          mass: 1,
          radius: 0.1,
          renderRadius: 0.15,
          color: '#5599ff',
          position: [0.1, 0, 0],
          velocity: [0, 0, 0],
        },
      ],
      { collisions: true, gravitationalConstant: 0 },
    );

    simulation.step(0.001);

    expect(simulation.count).toBe(1);
    expect(simulation.kinds[0]).toBe('black-hole');
    expect(simulation.masses[0]).toBe(6);
    expect(simulation.lastCollisionEvent?.outcome).toBe('capture');
  });
});
