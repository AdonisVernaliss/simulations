export const physicalWarpToModelRate = (
  physicalSecondsPerRealSecond: number,
  secondsPerModelUnit: number,
): number => {
  if (!Number.isFinite(physicalSecondsPerRealSecond) || physicalSecondsPerRealSecond < 0) {
    throw new RangeError('Physical time warp must be finite and non-negative');
  }
  if (!Number.isFinite(secondsPerModelUnit) || secondsPerModelUnit <= 0) {
    throw new RangeError('Seconds per model unit must be positive and finite');
  }
  return physicalSecondsPerRealSecond / secondsPerModelUnit;
};

export const modelTimeToPhysicalSeconds = (
  modelTime: number,
  secondsPerModelUnit: number,
): number => {
  if (!Number.isFinite(modelTime) || modelTime < 0) {
    throw new RangeError('Model time must be finite and non-negative');
  }
  if (!Number.isFinite(secondsPerModelUnit) || secondsPerModelUnit <= 0) {
    throw new RangeError('Seconds per model unit must be positive and finite');
  }
  return modelTime * secondsPerModelUnit;
};
