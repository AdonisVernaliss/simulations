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

/**
 * Eigenvalue ratio of the leading-order Newtonian point-mass tidal tensor in
 * its principal frame. The zero trace separates deformation from isotropic
 * expansion: radial stretching is accompanied by transverse compression.
 */
export const NEWTONIAN_TIDAL_EIGENVALUE_RATIO = [2, -1, -1] as const;

export interface AffineTidalAxes {
  readonly longitudinal: number;
  readonly transverse: number;
}

/**
 * Reduced-order affine response used by the renderer. It keeps the visual
 * ellipsoid volume constant while smoothly approaching a bounded disruption
 * shape; hydrodynamic mass loss is rendered separately as tracer streams.
 */
export const calculateAffineTidalAxes = (stressRatio: number): AffineTidalAxes => {
  if (!Number.isFinite(stressRatio) || stressRatio <= 0.015) {
    return { longitudinal: 1, transverse: 1 };
  }

  const response = stressRatio - 0.015;
  const longitudinal = 1 + 5.5 * (1 - Math.exp(-0.55 * response));
  return {
    longitudinal,
    transverse: 1 / Math.sqrt(longitudinal),
  };
};
