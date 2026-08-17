/** Bolometric specific intensity gains one power of g after frequency integration. */
export const BOLOMETRIC_DOPPLER_EXPONENT = 4;
export const THIN_DISK_RADIANCE_BASE = 0.9;
export const THIN_DISK_TEMPERATURE_WEIGHT = 2.4;
export const ACTIVE_NUCLEUS_RADIANCE_MULTIPLIER = 1.25;

export const calculateBolometricDopplerBoost = (frequencyShift: number): number => {
  if (!Number.isFinite(frequencyShift) || frequencyShift <= 0) return 0;
  return frequencyShift ** BOLOMETRIC_DOPPLER_EXPONENT;
};

export const calculateRelativeThinDiskRadiance = (
  normalizedTemperature: number,
  frequencyShift: number,
  activeNucleus: boolean,
): number => {
  if (!Number.isFinite(normalizedTemperature) || normalizedTemperature < 0) return 0;
  const activity = activeNucleus ? ACTIVE_NUCLEUS_RADIANCE_MULTIPLIER : 1;
  return (
    (THIN_DISK_RADIANCE_BASE + THIN_DISK_TEMPERATURE_WEIGHT * normalizedTemperature) *
    calculateBolometricDopplerBoost(frequencyShift) *
    activity
  );
};
