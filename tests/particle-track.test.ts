import { describe, expect, it } from 'vitest';

import {
  MAGNETIC_CURVATURE_FACTOR,
  createTrack,
  getParticle,
  getRelativisticKinematics,
  survivalProbability,
} from '../src/simulations/particle-lab/model/charged-particle';

describe('relativistic charged-particle motion', () => {
  it('satisfies the relativistic energy-momentum relation', () => {
    const particle = getParticle('muon-minus');
    const result = getRelativisticKinematics(particle, 1.25, 2);
    expect(result.totalEnergy ** 2 - result.momentum ** 2).toBeCloseTo(
      particle.massGeV ** 2,
      12,
    );
  });

  it('uses the PDG magnetic-curvature conversion', () => {
    const particle = getParticle('proton');
    const result = getRelativisticKinematics(particle, 2, 3.8);
    expect(
      result.momentum /
        (MAGNETIC_CURVATURE_FACTOR * Math.abs(particle.charge) * 3.8 * result.radius),
    ).toBeCloseTo(1, 12);
  });

  it('bends opposite charges in opposite directions', () => {
    const electronTrack = createTrack(getParticle('electron'), 1, 2, 0.5, 10);
    const positronTrack = createTrack(getParticle('positron'), 1, 2, 0.5, 10);
    expect(electronTrack.points[9]?.y).toBeGreaterThan(0);
    expect(positronTrack.points[9]?.y).toBeLessThan(0);
    expect(Math.abs(electronTrack.points[9]?.y ?? 0)).toBeCloseTo(
      Math.abs(positronTrack.points[9]?.y ?? 0),
      12,
    );
  });

  it('gives e^-1 survival at one mean decay length', () => {
    expect(survivalProbability(4, 4)).toBeCloseTo(Math.exp(-1), 14);
  });

  it('reduces to a straight line when the field is zero', () => {
    const track = createTrack(getParticle('pion-plus'), 0.5, 0, 2, 20);
    expect(track.kinematics.radius).toBe(Number.POSITIVE_INFINITY);
    expect(track.points.every((point) => Math.abs(point.y) < 1e-14)).toBe(true);
    expect(track.points.at(-1)?.x).toBeCloseTo(2, 12);
  });
});
