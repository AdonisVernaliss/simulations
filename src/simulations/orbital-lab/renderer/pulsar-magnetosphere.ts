export interface PulsarMagnetosphereLayout {
  readonly closedField: Float32Array;
  readonly openField: Float32Array;
  readonly currentSheet: Float32Array;
}

const LIGHT_CYLINDER_RADIUS = 2.75;
const WIND_RENDER_RADIUS = 46;

type Point = readonly [number, number, number];

const appendSegment = (target: number[], first: Point, second: Point): void => {
  target.push(...first, ...second);
};

const dipolePoint = (shellRadius: number, theta: number, azimuth: number): Point => {
  const sine = Math.sin(theta);
  const radius = shellRadius * sine ** 2;
  return [
    radius * sine * Math.cos(azimuth),
    radius * Math.cos(theta),
    radius * sine * Math.sin(azimuth),
  ];
};

/**
 * Browser-scale morphology of a rotating force-free pulsar magnetosphere.
 * Closed lines use the static dipole solution inside the light cylinder.
 * Outside it, polar lines approach a radial force-free wind while rotation
 * winds their azimuth into the split-monopole/striped-wind morphology.
 */
export const createPulsarMagnetosphereLayout = (): PulsarMagnetosphereLayout => {
  const closedField: number[] = [];
  const openField: number[] = [];
  const currentSheet: number[] = [];
  const shells = [1.55, 2.1, 2.75];

  for (const shell of shells) {
    const thetaStart = Math.asin(Math.sqrt(1 / shell));
    for (let azimuthIndex = 0; azimuthIndex < 10; azimuthIndex += 1) {
      const azimuth = (azimuthIndex / 10) * Math.PI * 2;
      let previous = dipolePoint(shell, thetaStart, azimuth);
      for (let step = 1; step <= 44; step += 1) {
        const fraction = step / 44;
        const theta = thetaStart + (Math.PI - thetaStart * 2) * fraction;
        const next = dipolePoint(shell, theta, azimuth);
        appendSegment(closedField, previous, next);
        previous = next;
      }
    }
  }

  for (const hemisphere of [-1, 1]) {
    for (let azimuthIndex = 0; azimuthIndex < 8; azimuthIndex += 1) {
      const baseAzimuth = (azimuthIndex / 8) * Math.PI * 2;
      let previous: Point = [Math.cos(baseAzimuth) * 0.24, hemisphere * 0.97, Math.sin(baseAzimuth) * 0.24];
      for (let step = 1; step <= 96; step += 1) {
        const fraction = step / 96;
        const radialDistance = 1 + fraction * (WIND_RENDER_RADIUS - 1);
        const openingAngle = 0.235 + 0.045 * (1 - Math.exp(-fraction * 7));
        const axial = hemisphere * radialDistance * Math.cos(openingAngle);
        const cylindricalRadius = radialDistance * Math.sin(openingAngle);
        const sweptAzimuth =
          baseAzimuth - hemisphere * (radialDistance - 1) / LIGHT_CYLINDER_RADIUS;
        const next: Point = [
          Math.cos(sweptAzimuth) * cylindricalRadius,
          axial,
          Math.sin(sweptAzimuth) * cylindricalRadius,
        ];
        appendSegment(openField, previous, next);
        previous = next;
      }
    }
  }

  for (let layer = -1; layer <= 1; layer += 1) {
    let previous: Point | undefined;
    for (let step = 0; step <= 160; step += 1) {
      const fraction = step / 160;
      const radius = LIGHT_CYLINDER_RADIUS + fraction * (WIND_RENDER_RADIUS - LIGHT_CYLINDER_RADIUS);
      const azimuth = (radius - LIGHT_CYLINDER_RADIUS) / LIGHT_CYLINDER_RADIUS + layer * 0.18;
      const ripple =
        Math.sin(azimuth * 2 - layer * 0.7) * (0.13 + fraction * 0.48) +
        layer * (0.07 + fraction * 0.16);
      const next: Point = [
        Math.cos(azimuth) * radius,
        ripple,
        Math.sin(azimuth) * radius,
      ];
      if (previous !== undefined) appendSegment(currentSheet, previous, next);
      previous = next;
    }
  }

  return {
    closedField: new Float32Array(closedField),
    openField: new Float32Array(openField),
    currentSheet: new Float32Array(currentSheet),
  };
};
