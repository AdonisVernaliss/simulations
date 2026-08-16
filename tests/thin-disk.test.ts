import { describe, expect, it } from 'vitest';

import {
  INNER_RADIUS_RG,
  THIN_DISK_EFFICIENCY,
  getAccretionRate,
  getDiskFlux,
  getDiskTemperature,
  getEddingtonLuminosity,
} from '../src/simulations/quasar-lab/model/thin-disk';

describe('thin accretion disk baseline', () => {
  it('has zero flux at the zero-torque inner edge', () => {
    const accretionRate = getAccretionRate(1e8, 0.2);
    expect(getDiskFlux(1e8, accretionRate, INNER_RADIUS_RG)).toBeCloseTo(0, 16);
  });

  it('places maximum flux at 49/36 times the inner radius', () => {
    const accretionRate = getAccretionRate(1e8, 0.2);
    const expectedRadius = (49 / 36) * INNER_RADIUS_RG;
    const centreFlux = getDiskFlux(1e8, accretionRate, expectedRadius);
    expect(centreFlux).toBeGreaterThan(getDiskFlux(1e8, accretionRate, expectedRadius * 0.95));
    expect(centreFlux).toBeGreaterThan(getDiskFlux(1e8, accretionRate, expectedRadius * 1.05));
  });

  it('scales temperature as M^-1/4 at fixed Eddington ratio', () => {
    const radius = (49 / 36) * INNER_RADIUS_RG;
    const lowMassTemperature = getDiskTemperature(
      1e7,
      getAccretionRate(1e7, 0.1),
      radius,
    );
    const highMassTemperature = getDiskTemperature(
      1e8,
      getAccretionRate(1e8, 0.1),
      radius,
    );
    expect(lowMassTemperature / highMassTemperature).toBeCloseTo(10 ** 0.25, 12);
  });

  it('sets accretion luminosity from the declared Newtonian efficiency', () => {
    const mass = 5e8;
    const ratio = 0.35;
    const accretionRate = getAccretionRate(mass, ratio);
    const luminosity = accretionRate * 299_792_458 ** 2 * THIN_DISK_EFFICIENCY;
    expect(luminosity / (getEddingtonLuminosity(mass) * ratio)).toBeCloseTo(1, 12);
  });
});
