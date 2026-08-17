/** Bolometric specific intensity gains one power of g after frequency integration. */
export const BOLOMETRIC_DOPPLER_EXPONENT = 4;

export const calculateBolometricDopplerBoost = (frequencyShift: number): number => {
  if (!Number.isFinite(frequencyShift) || frequencyShift <= 0) return 0;
  return frequencyShift ** BOLOMETRIC_DOPPLER_EXPONENT;
};
