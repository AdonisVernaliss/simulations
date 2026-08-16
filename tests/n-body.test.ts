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
});
