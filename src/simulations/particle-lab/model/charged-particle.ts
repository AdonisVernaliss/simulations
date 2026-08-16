export type ParticleId =
  | 'electron'
  | 'positron'
  | 'muon-minus'
  | 'pion-plus'
  | 'proton'
  | 'antiproton';

export interface ChargedParticle {
  readonly id: ParticleId;
  readonly name: string;
  readonly symbol: string;
  readonly massGeV: number;
  readonly charge: -1 | 1;
  readonly meanLifetimeSeconds?: number;
  readonly color: string;
}

export interface RelativisticKinematics {
  readonly kineticEnergy: number;
  readonly totalEnergy: number;
  readonly momentum: number;
  readonly beta: number;
  readonly gamma: number;
  readonly radius: number;
  readonly meanDecayLength: number;
}

export interface TrackPoint {
  readonly x: number;
  readonly y: number;
  readonly pathLength: number;
  readonly survival: number;
}

export interface ParticleTrack {
  readonly particle: ChargedParticle;
  readonly kinematics: RelativisticKinematics;
  readonly magneticField: number;
  readonly points: readonly TrackPoint[];
}

export const SPEED_OF_LIGHT = 299_792_458;
export const MAGNETIC_CURVATURE_FACTOR = 0.299_792_458;

export const chargedParticles: readonly ChargedParticle[] = [
  {
    id: 'electron',
    name: 'Electron',
    symbol: 'e⁻',
    massGeV: 0.000_510_998_950_69,
    charge: -1,
    color: '#59d5ff',
  },
  {
    id: 'positron',
    name: 'Positron',
    symbol: 'e⁺',
    massGeV: 0.000_510_998_950_69,
    charge: 1,
    color: '#ff9a69',
  },
  {
    id: 'muon-minus',
    name: 'Muon',
    symbol: 'μ⁻',
    massGeV: 0.105_658_375_5,
    charge: -1,
    meanLifetimeSeconds: 2.196_981_1e-6,
    color: '#8c8cff',
  },
  {
    id: 'pion-plus',
    name: 'Charged pion',
    symbol: 'π⁺',
    massGeV: 0.139_570_39,
    charge: 1,
    meanLifetimeSeconds: 2.603_3e-8,
    color: '#ffcd67',
  },
  {
    id: 'proton',
    name: 'Proton',
    symbol: 'p',
    massGeV: 0.938_272_089_43,
    charge: 1,
    color: '#75e5b6',
  },
  {
    id: 'antiproton',
    name: 'Antiproton',
    symbol: 'p̄',
    massGeV: 0.938_272_089_43,
    charge: -1,
    color: '#e982ff',
  },
] as const;

export const getParticle = (id: ParticleId): ChargedParticle => {
  const particle = chargedParticles.find((candidate) => candidate.id === id);
  if (particle === undefined) {
    throw new Error(`Unknown charged particle: ${id}`);
  }
  return particle;
};

export const survivalProbability = (pathLength: number, meanDecayLength: number): number => {
  if (pathLength < 0 || meanDecayLength <= 0) {
    throw new RangeError('Path length must be non-negative and decay length must be positive.');
  }
  if (!Number.isFinite(meanDecayLength)) {
    return 1;
  }
  return Math.exp(-pathLength / meanDecayLength);
};

export const getRelativisticKinematics = (
  particle: ChargedParticle,
  kineticEnergyGeV: number,
  magneticFieldTesla: number,
): RelativisticKinematics => {
  if (!Number.isFinite(kineticEnergyGeV) || kineticEnergyGeV < 0) {
    throw new RangeError('Kinetic energy must be finite and non-negative.');
  }
  if (!Number.isFinite(magneticFieldTesla)) {
    throw new RangeError('Magnetic field must be finite.');
  }

  const totalEnergy = particle.massGeV + kineticEnergyGeV;
  const momentum = Math.sqrt(
    Math.max(totalEnergy * totalEnergy - particle.massGeV * particle.massGeV, 0),
  );
  const gamma = totalEnergy / particle.massGeV;
  const beta = totalEnergy === 0 ? 0 : momentum / totalEnergy;
  const radius =
    magneticFieldTesla === 0 || momentum === 0
      ? Number.POSITIVE_INFINITY
      : momentum /
        (MAGNETIC_CURVATURE_FACTOR * Math.abs(particle.charge * magneticFieldTesla));
  const meanDecayLength =
    particle.meanLifetimeSeconds === undefined
      ? Number.POSITIVE_INFINITY
      : (momentum / particle.massGeV) * SPEED_OF_LIGHT * particle.meanLifetimeSeconds;

  return {
    kineticEnergy: kineticEnergyGeV,
    totalEnergy,
    momentum,
    beta,
    gamma,
    radius,
    meanDecayLength,
  };
};

export const createTrack = (
  particle: ChargedParticle,
  kineticEnergyGeV: number,
  magneticFieldTesla: number,
  pathLengthMetres: number,
  pointCount = 480,
): ParticleTrack => {
  if (!Number.isFinite(pathLengthMetres) || pathLengthMetres < 0) {
    throw new RangeError('Track length must be finite and non-negative.');
  }
  if (!Number.isInteger(pointCount) || pointCount < 2) {
    throw new RangeError('Track point count must be an integer of at least two.');
  }

  const kinematics = getRelativisticKinematics(
    particle,
    kineticEnergyGeV,
    magneticFieldTesla,
  );
  const direction = particle.charge * (magneticFieldTesla < 0 ? -1 : 1);
  const points: TrackPoint[] = [];

  for (let index = 0; index < pointCount; index += 1) {
    const pathLength = (index / (pointCount - 1)) * pathLengthMetres;
    let x: number;
    let y: number;

    if (!Number.isFinite(kinematics.radius) || kinematics.radius === 0) {
      x = pathLength;
      y = 0;
    } else {
      const angle = pathLength / kinematics.radius;
      x = kinematics.radius * Math.sin(angle);
      y = direction * kinematics.radius * (Math.cos(angle) - 1);
    }

    points.push({
      x,
      y,
      pathLength,
      survival: survivalProbability(pathLength, kinematics.meanDecayLength),
    });
  }

  return { particle, kinematics, magneticField: magneticFieldTesla, points };
};
