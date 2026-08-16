import { describe, expect, it } from 'vitest';

import { analyzeCollision } from '../src/simulations/orbital-lab/model/collision-model';

const baseCollision = {
  firstMass: 1,
  secondMass: 1,
  firstRadius: 0.2,
  secondRadius: 0.2,
  firstKind: 'rocky' as const,
  secondKind: 'rocky' as const,
  relativePosition: [0.4, 0, 0] as const,
  gravitationalConstant: 1,
};

describe('gravity-regime collision model', () => {
  it('classifies low-energy contact as accretion', () => {
    const collision = analyzeCollision({
      ...baseCollision,
      relativeVelocity: [-1, 0, 0],
    });

    expect(collision.outcome).toBe('merge');
    expect(collision.specificImpactEnergy).toBeLessThan(collision.disruptionThreshold);
  });

  it('classifies energy above the catastrophic threshold as disruption', () => {
    const collision = analyzeCollision({
      ...baseCollision,
      relativeVelocity: [-12, 0, 0],
    });

    expect(collision.outcome).toBe('disruption');
    expect(collision.energyRatio).toBeGreaterThan(1);
  });

  it('treats black-hole contact as capture and estimates merger radiation separately', () => {
    const capture = analyzeCollision({
      ...baseCollision,
      firstMass: 5,
      firstKind: 'black-hole',
      relativeVelocity: [-3, 0, 0],
    });
    const merger = analyzeCollision({
      ...baseCollision,
      firstKind: 'black-hole',
      secondKind: 'black-hole',
      relativeVelocity: [-3, 0, 0],
    });

    expect(capture.outcome).toBe('capture');
    expect(capture.radiatedMass).toBe(0);
    expect(merger.outcome).toBe('black-hole-merger');
    expect(merger.radiatedMass).toBeCloseTo(0.1, 12);
  });
});
