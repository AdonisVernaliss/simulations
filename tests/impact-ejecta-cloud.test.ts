import { describe, expect, it } from 'vitest';

import type { CollisionEvent } from '../src/simulations/orbital-lab/model/types';
import { ImpactEjectaCloud } from '../src/simulations/orbital-lab/renderer/impact-ejecta-cloud';

const collision: CollisionEvent = {
  sequence: 1,
  time: 2,
  outcome: 'merge',
  participants: ['first', 'second'],
  impactSpeed: 3,
  mutualEscapeSpeed: 2,
  specificImpactEnergy: 0.4,
  disruptionThreshold: 1,
  position: [1, 2, 3],
  normal: [1, 0, 0],
  visualRadius: 0.2,
  ejectaSpeed: 1.5,
  fragmentCount: 1,
  radiatedMass: 0,
};

describe('impact ejecta tracer', () => {
  it('creates one bounded GPU cloud and expires it without adding bodies', () => {
    const cloud = new ImpactEjectaCloud();
    cloud.setQuality('low');
    cloud.show(collision);

    expect(cloud.points.visible).toBe(true);
    expect(cloud.points.position.toArray()).toEqual(collision.position);
    expect(cloud.points.geometry.drawRange.count).toBe(96);
    expect(
      Array.from(cloud.points.geometry.getAttribute('aVelocity').array).every(Number.isFinite),
    ).toBe(true);

    cloud.update(6, 600);
    expect(cloud.points.visible).toBe(false);
    cloud.dispose();
  });

  it('does not draw material ejecta for horizon capture', () => {
    const cloud = new ImpactEjectaCloud();
    cloud.show({ ...collision, outcome: 'capture' });
    expect(cloud.points.visible).toBe(false);
    cloud.dispose();
  });
});
