import { describe, expect, it } from 'vitest';

import {
  CRITICAL_IMPACT_PARAMETER,
  PHOTON_SPHERE_RADIUS,
  getSchwarzschildRadius,
  traceNullGeodesic,
} from '../src/simulations/black-hole-lab/model/schwarzschild';

describe('Schwarzschild null geodesics', () => {
  it('uses the exact photon-sphere and critical-impact ratios', () => {
    expect(PHOTON_SPHERE_RADIUS).toBe(1.5);
    expect(CRITICAL_IMPACT_PARAMETER).toBeCloseTo((3 * Math.sqrt(3)) / 2, 14);
  });

  it('converts nominal solar masses to Schwarzschild radius', () => {
    expect(getSchwarzschildRadius(1)).toBeCloseTo(2_953.250_076_100_249_8, 8);
  });

  it('captures rays below the critical impact parameter', () => {
    expect(traceNullGeodesic(2.4, 30).outcome).toBe('captured');
  });

  it('allows rays above the critical impact parameter to escape', () => {
    expect(traceNullGeodesic(3.2, 30).outcome).toBe('escaped');
  });

  it('is mirror symmetric about the equatorial axis', () => {
    const positive = traceNullGeodesic(4, 25);
    const negative = traceNullGeodesic(-4, 25);
    expect(positive.points.length).toBe(negative.points.length);
    for (let index = 0; index < positive.points.length; index += 20) {
      expect(positive.points[index]?.x).toBeCloseTo(negative.points[index]?.x ?? 0, 12);
      expect(positive.points[index]?.y).toBeCloseTo(-(negative.points[index]?.y ?? 0), 12);
    }
  });

  it('approaches the weak-field deflection limit', () => {
    const result = traceNullGeodesic(12, 120);
    expect(result.outcome).toBe('escaped');
    expect(result.deflectionAngle).toBeCloseTo(2 / 12, 1);
  });
});
