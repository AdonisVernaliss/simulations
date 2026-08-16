/**
 * Ratio of the leading-order tidal acceleration across a body to the body's
 * own surface gravity. G cancels when both accelerations use the same units.
 */
export const calculateTidalStressRatio = (
  sourceMass: number,
  bodyMass: number,
  bodyRadius: number,
  separation: number,
): number => {
  if (
    sourceMass <= 0 ||
    bodyMass <= 0 ||
    bodyRadius <= 0 ||
    separation <= 0 ||
    !Number.isFinite(sourceMass + bodyMass + bodyRadius + separation)
  ) {
    return 0;
  }

  return (2 * sourceMass * bodyRadius ** 3) / (bodyMass * separation ** 3);
};
