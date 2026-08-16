export interface DiskAnnulus {
  readonly radiusRg: number;
  readonly flux: number;
  readonly temperature: number;
}

export const SPEED_OF_LIGHT = 299_792_458;
export const NOMINAL_SOLAR_MASS_PARAMETER = 1.327_124_4e20;
export const PROTON_MASS_KG = 1.672_621_925_95e-27;
export const THOMSON_CROSS_SECTION = 6.652_458_705_1e-29;
export const STEFAN_BOLTZMANN_CONSTANT = 5.670_374_419e-8;
export const WIEN_DISPLACEMENT_CONSTANT = 2.897_771_955e-3;
export const INNER_RADIUS_RG = 6;
export const THIN_DISK_EFFICIENCY = 1 / 12;

const validateSolarMasses = (solarMasses: number): void => {
  if (!Number.isFinite(solarMasses) || solarMasses <= 0) {
    throw new RangeError('Black-hole mass must be finite and positive.');
  }
};

export const getEddingtonLuminosity = (solarMasses: number): number => {
  validateSolarMasses(solarMasses);
  const gravitationalParameter = NOMINAL_SOLAR_MASS_PARAMETER * solarMasses;
  return (
    (4 * Math.PI * gravitationalParameter * PROTON_MASS_KG * SPEED_OF_LIGHT) /
    THOMSON_CROSS_SECTION
  );
};

export const getAccretionRate = (solarMasses: number, eddingtonRatio: number): number => {
  if (!Number.isFinite(eddingtonRatio) || eddingtonRatio <= 0 || eddingtonRatio > 1) {
    throw new RangeError('Eddington ratio must be in the interval (0, 1].');
  }
  return (
    (eddingtonRatio * getEddingtonLuminosity(solarMasses)) /
    (THIN_DISK_EFFICIENCY * SPEED_OF_LIGHT ** 2)
  );
};

export const getDiskFlux = (
  solarMasses: number,
  accretionRateKgPerSecond: number,
  radiusRg: number,
): number => {
  validateSolarMasses(solarMasses);
  if (!Number.isFinite(accretionRateKgPerSecond) || accretionRateKgPerSecond <= 0) {
    throw new RangeError('Accretion rate must be finite and positive.');
  }
  if (!Number.isFinite(radiusRg) || radiusRg < INNER_RADIUS_RG) {
    throw new RangeError(`Disk radius must be at least ${INNER_RADIUS_RG} gravitational radii.`);
  }
  if (radiusRg === INNER_RADIUS_RG) {
    return 0;
  }

  const gravitationalParameter = NOMINAL_SOLAR_MASS_PARAMETER * solarMasses;
  const gravitationalRadius = gravitationalParameter / SPEED_OF_LIGHT ** 2;
  const radius = radiusRg * gravitationalRadius;
  const innerRadius = INNER_RADIUS_RG * gravitationalRadius;
  return (
    ((3 * gravitationalParameter * accretionRateKgPerSecond) / (8 * Math.PI * radius ** 3)) *
    (1 - Math.sqrt(innerRadius / radius))
  );
};

export const getDiskTemperature = (
  solarMasses: number,
  accretionRateKgPerSecond: number,
  radiusRg: number,
): number =>
  (getDiskFlux(solarMasses, accretionRateKgPerSecond, radiusRg) /
    STEFAN_BOLTZMANN_CONSTANT) ** 0.25;

export const getPeakDiskTemperature = (
  solarMasses: number,
  accretionRateKgPerSecond: number,
): number =>
  getDiskTemperature(
    solarMasses,
    accretionRateKgPerSecond,
    (49 / 36) * INNER_RADIUS_RG,
  );

export const getWienPeakWavelength = (temperatureKelvin: number): number => {
  if (!Number.isFinite(temperatureKelvin) || temperatureKelvin <= 0) {
    throw new RangeError('Temperature must be finite and positive.');
  }
  return WIEN_DISPLACEMENT_CONSTANT / temperatureKelvin;
};

export const createDiskProfile = (
  solarMasses: number,
  eddingtonRatio: number,
  count = 180,
  outerRadiusRg = 500,
): readonly DiskAnnulus[] => {
  if (!Number.isInteger(count) || count < 2) {
    throw new RangeError('Disk profile requires at least two annuli.');
  }
  if (!Number.isFinite(outerRadiusRg) || outerRadiusRg <= INNER_RADIUS_RG) {
    throw new RangeError('Outer disk radius must exceed the inner radius.');
  }

  const accretionRate = getAccretionRate(solarMasses, eddingtonRatio);
  const logarithmicSpan = Math.log(outerRadiusRg / INNER_RADIUS_RG);
  return Array.from({ length: count }, (_, index) => {
    const fraction = index / (count - 1);
    const radiusRg = INNER_RADIUS_RG * Math.exp(logarithmicSpan * fraction);
    const flux = getDiskFlux(solarMasses, accretionRate, radiusRg);
    return {
      radiusRg,
      flux,
      temperature: (flux / STEFAN_BOLTZMANN_CONSTANT) ** 0.25,
    };
  });
};
