import { probabilityDensity, wavefunction, type HydrogenState } from './hydrogen';

export interface OrbitalSample {
  readonly positions: Float32Array;
  readonly phases: Int8Array;
}

class DeterministicRandom {
  private state: number;
  private spareGaussian: number | undefined;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  uniform(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 4_294_967_296;
  }

  gaussian(): number {
    if (this.spareGaussian !== undefined) {
      const value = this.spareGaussian;
      this.spareGaussian = undefined;
      return value;
    }

    const radius = Math.sqrt(-2 * Math.log(Math.max(this.uniform(), Number.EPSILON)));
    const angle = 2 * Math.PI * this.uniform();
    this.spareGaussian = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  }
}

const randomPointInSphere = (
  random: DeterministicRandom,
  radius: number,
): readonly [number, number, number] => {
  while (true) {
    const x = (random.uniform() * 2 - 1) * radius;
    const y = (random.uniform() * 2 - 1) * radius;
    const z = (random.uniform() * 2 - 1) * radius;
    if (x * x + y * y + z * z <= radius * radius) {
      return [x, y, z];
    }
  }
};

export const sampleOrbital = (
  state: HydrogenState,
  count: number,
  seed = 0x61746f6d,
): OrbitalSample => {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('Orbital sample count must be a positive integer.');
  }

  const random = new DeterministicRandom(seed);
  const positions = new Float32Array(count * 3);
  const phases = new Int8Array(count);
  const proposalScale = state.n * 0.62;
  let [x, y, z] = randomPointInSphere(random, state.extent * 0.4);
  let density = probabilityDensity(state, x, y, z);

  const step = (): void => {
    let candidateX: number;
    let candidateY: number;
    let candidateZ: number;

    if (random.uniform() < 0.025) {
      [candidateX, candidateY, candidateZ] = randomPointInSphere(random, state.extent);
    } else {
      candidateX = x + random.gaussian() * proposalScale;
      candidateY = y + random.gaussian() * proposalScale;
      candidateZ = z + random.gaussian() * proposalScale;
    }

    if (Math.hypot(candidateX, candidateY, candidateZ) > state.extent) {
      return;
    }

    const candidateDensity = probabilityDensity(state, candidateX, candidateY, candidateZ);
    const acceptance = density <= Number.MIN_VALUE ? 1 : candidateDensity / density;
    if (acceptance >= 1 || random.uniform() < acceptance) {
      x = candidateX;
      y = candidateY;
      z = candidateZ;
      density = candidateDensity;
    }
  };

  for (let burnIn = 0; burnIn < 2_500; burnIn += 1) {
    step();
  }

  for (let index = 0; index < count; index += 1) {
    step();
    step();
    step();
    const offset = index * 3;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    phases[index] = wavefunction(state, x, y, z) < 0 ? -1 : 1;
  }

  return { positions, phases };
};
