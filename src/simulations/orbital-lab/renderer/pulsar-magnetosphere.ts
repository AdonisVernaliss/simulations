export interface PulsarMagnetosphereLayout {
  readonly closedField: Float32Array;
  readonly openField: Float32Array;
  readonly currentSheet: Float32Array;
}

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
 * Closed lines use the static dipole solution; polar lines open and sweep
 * backward outside the normalized light-cylinder radius.
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
      for (let step = 1; step <= 34; step += 1) {
        const fraction = step / 34;
        const axial = hemisphere * (0.97 + fraction * 4.15);
        const cylindricalRadius = 0.24 + fraction * 1.05 + fraction ** 2 * 0.42;
        const sweptAzimuth = baseAzimuth - hemisphere * fraction ** 2 * 0.82;
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
    for (let step = 0; step <= 96; step += 1) {
      const fraction = step / 96;
      const radius = 2.65 + fraction * 3.0;
      const azimuth = fraction * Math.PI * 3.1 + layer * 0.18;
      const ripple = Math.sin(azimuth * 2 - layer * 0.7) * 0.13 + layer * 0.07;
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
