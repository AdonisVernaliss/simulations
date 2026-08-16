export type HydrogenStateId = '1s' | '2s' | '2p-z' | '3p-z' | '3d-z2';

export interface HydrogenState {
  readonly id: HydrogenStateId;
  readonly label: string;
  readonly n: number;
  readonly l: number;
  readonly m: number;
  readonly extent: number;
  readonly radialNodes: number;
  readonly angularNodes: number;
  readonly description: string;
}

export const BOHR_RADIUS_METRES = 5.291_772_105_44e-11;
export const HARTREE_ENERGY_EV = 27.211_386_245_981;

export const hydrogenStates: readonly HydrogenState[] = [
  {
    id: '1s',
    label: '1s',
    n: 1,
    l: 0,
    m: 0,
    extent: 5.5,
    radialNodes: 0,
    angularNodes: 0,
    description: 'Spherically symmetric ground state with no nodes.',
  },
  {
    id: '2s',
    label: '2s',
    n: 2,
    l: 0,
    m: 0,
    extent: 13,
    radialNodes: 1,
    angularNodes: 0,
    description: 'Spherical excited state with a radial node at r = 2a₀.',
  },
  {
    id: '2p-z',
    label: '2p z',
    n: 2,
    l: 1,
    m: 0,
    extent: 13,
    radialNodes: 0,
    angularNodes: 1,
    description: 'Two-lobed state separated by the nodal xy plane.',
  },
  {
    id: '3p-z',
    label: '3p z',
    n: 3,
    l: 1,
    m: 0,
    extent: 26,
    radialNodes: 1,
    angularNodes: 1,
    description: 'A p state with one angular node and one spherical radial node.',
  },
  {
    id: '3d-z2',
    label: '3d z²',
    n: 3,
    l: 2,
    m: 0,
    extent: 24,
    radialNodes: 0,
    angularNodes: 2,
    description: 'The real m = 0 d state with two conical angular nodes.',
  },
] as const;

export const getHydrogenState = (id: HydrogenStateId): HydrogenState => {
  const state = hydrogenStates.find((candidate) => candidate.id === id);
  if (state === undefined) {
    throw new Error(`Unknown hydrogen state: ${id}`);
  }
  return state;
};

export const getHydrogenEnergy = (principalQuantumNumber: number): number => {
  if (!Number.isInteger(principalQuantumNumber) || principalQuantumNumber < 1) {
    throw new RangeError('The principal quantum number must be a positive integer.');
  }
  return -HARTREE_ENERGY_EV / (2 * principalQuantumNumber ** 2);
};

export const wavefunction = (
  state: HydrogenState,
  x: number,
  y: number,
  z: number,
): number => {
  const radius = Math.hypot(x, y, z);

  switch (state.id) {
    case '1s':
      return Math.exp(-radius) / Math.sqrt(Math.PI);
    case '2s':
      return ((2 - radius) * Math.exp(-radius / 2)) / (4 * Math.sqrt(2 * Math.PI));
    case '2p-z':
      return (z * Math.exp(-radius / 2)) / (4 * Math.sqrt(2 * Math.PI));
    case '3p-z':
      return (
        (2 * Math.sqrt(2) * z * (6 - radius) * Math.exp(-radius / 3)) /
        (81 * Math.sqrt(Math.PI))
      );
    case '3d-z2':
      return (
        ((3 * z * z - radius * radius) * Math.exp(-radius / 3)) /
        (81 * Math.sqrt(6 * Math.PI))
      );
  }
};

export const probabilityDensity = (
  state: HydrogenState,
  x: number,
  y: number,
  z: number,
): number => {
  const amplitude = wavefunction(state, x, y, z);
  return amplitude * amplitude;
};
