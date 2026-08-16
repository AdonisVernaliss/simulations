export interface GeodesicPoint {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface NullGeodesic {
  readonly impactParameter: number;
  readonly outcome: 'captured' | 'escaped' | 'integration-limit';
  readonly deflectionAngle: number;
  readonly closestApproach: number;
  readonly points: readonly GeodesicPoint[];
}

export const SPEED_OF_LIGHT = 299_792_458;
export const NOMINAL_SOLAR_MASS_PARAMETER = 1.327_124_4e20;
export const EVENT_HORIZON_RADIUS = 1;
export const PHOTON_SPHERE_RADIUS = 1.5;
export const CRITICAL_IMPACT_PARAMETER = (3 * Math.sqrt(3)) / 2;

export const getSchwarzschildRadius = (solarMasses: number): number => {
  if (!Number.isFinite(solarMasses) || solarMasses <= 0) {
    throw new RangeError('Black-hole mass must be finite and positive.');
  }
  return (2 * NOMINAL_SOLAR_MASS_PARAMETER * solarMasses) / SPEED_OF_LIGHT ** 2;
};

const derivative = (inverseRadius: number, radialDerivative: number): readonly [number, number] =>
  [radialDerivative, 1.5 * inverseRadius * inverseRadius - inverseRadius];

const integrateStep = (
  inverseRadius: number,
  radialDerivative: number,
  step: number,
): readonly [number, number] => {
  const [k1u, k1v] = derivative(inverseRadius, radialDerivative);
  const [k2u, k2v] = derivative(
    inverseRadius + (step * k1u) / 2,
    radialDerivative + (step * k1v) / 2,
  );
  const [k3u, k3v] = derivative(
    inverseRadius + (step * k2u) / 2,
    radialDerivative + (step * k2v) / 2,
  );
  const [k4u, k4v] = derivative(
    inverseRadius + step * k3u,
    radialDerivative + step * k3v,
  );

  return [
    inverseRadius + (step / 6) * (k1u + 2 * k2u + 2 * k3u + k4u),
    radialDerivative + (step / 6) * (k1v + 2 * k2v + 2 * k3v + k4v),
  ];
};

const calculateDeflection = (points: readonly GeodesicPoint[]): number => {
  const tail = points.at(-1);
  const previous = points[Math.max(0, points.length - 20)];
  if (tail === undefined || previous === undefined) {
    return 0;
  }
  return Math.abs(Math.atan2(tail.y - previous.y, tail.x - previous.x));
};

export const traceNullGeodesic = (
  impactParameter: number,
  observerDistance = 18,
  angularStep = 0.0015,
): NullGeodesic => {
  if (!Number.isFinite(impactParameter)) {
    throw new RangeError('Impact parameter must be finite.');
  }
  if (!Number.isFinite(observerDistance) || observerDistance <= EVENT_HORIZON_RADIUS) {
    throw new RangeError('Observer distance must be outside the event horizon.');
  }
  if (!Number.isFinite(angularStep) || angularStep <= 0 || angularStep > 0.02) {
    throw new RangeError('Angular step must be in the interval (0, 0.02].');
  }

  const sign = impactParameter < 0 ? -1 : 1;
  const absoluteImpact = Math.abs(impactParameter);
  if (absoluteImpact < 1e-8) {
    const points: GeodesicPoint[] = [];
    for (let index = 0; index <= 240; index += 1) {
      const x = -observerDistance + (index / 240) * (observerDistance - EVENT_HORIZON_RADIUS);
      points.push({ x, y: 0, radius: Math.abs(x) });
    }
    return {
      impactParameter,
      outcome: 'captured',
      deflectionAngle: 0,
      closestApproach: EVENT_HORIZON_RADIUS,
      points,
    };
  }

  let azimuth = Math.PI - Math.atan2(absoluteImpact, observerDistance);
  let inverseRadius = 1 / Math.hypot(observerDistance, absoluteImpact);
  let radialDerivative = Math.cos(azimuth) / absoluteImpact;
  let closestApproach = 1 / inverseRadius;
  let outcome: NullGeodesic['outcome'] = 'integration-limit';
  const points: GeodesicPoint[] = [
    { x: -observerDistance, y: impactParameter, radius: 1 / inverseRadius },
  ];
  const step = -angularStep;

  for (let index = 0; index < 50_000; index += 1) {
    [inverseRadius, radialDerivative] = integrateStep(inverseRadius, radialDerivative, step);
    azimuth += step;

    if (!Number.isFinite(inverseRadius) || !Number.isFinite(radialDerivative)) {
      break;
    }
    if (inverseRadius <= 0) {
      outcome = 'escaped';
      break;
    }

    const radius = 1 / inverseRadius;
    closestApproach = Math.min(closestApproach, radius);
    const x = radius * Math.cos(azimuth);
    const y = sign * radius * Math.sin(azimuth);
    points.push({ x, y, radius });

    if (radius <= EVENT_HORIZON_RADIUS) {
      outcome = 'captured';
      break;
    }
    if (x > 0 && radius >= observerDistance) {
      outcome = 'escaped';
      break;
    }
  }

  return {
    impactParameter,
    outcome,
    deflectionAngle: calculateDeflection(points),
    closestApproach,
    points,
  };
};
