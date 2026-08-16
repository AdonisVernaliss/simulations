export type LabId = 'orbital' | 'atomic' | 'particle' | 'black-hole' | 'quasar';

export interface LabDefinition {
  readonly id: LabId;
  readonly name: string;
  readonly field: string;
  readonly summary: string;
  readonly status: 'available' | 'research';
  readonly model: string;
  readonly experimentCount: number;
}

export const labs: readonly LabDefinition[] = [
  {
    id: 'orbital',
    name: 'Orbital Mechanics',
    field: 'Classical mechanics',
    summary: 'Build and inspect gravitational systems in a real-time Newtonian N-body sandbox.',
    status: 'available',
    model: 'Newtonian point masses · velocity Verlet · inelastic merging',
    experimentCount: 4,
  },
  {
    id: 'atomic',
    name: 'Atomic Orbitals',
    field: 'Quantum mechanics',
    summary: 'Explore stationary hydrogenic states as probability densities rather than particle paths.',
    status: 'available',
    model: 'Coulomb Schrödinger equation · analytic hydrogenic eigenstates',
    experimentCount: 4,
  },
  {
    id: 'particle',
    name: 'Particle Physics',
    field: 'High-energy physics',
    summary: 'Inspect relativistic charged-particle tracks, decays, and conservation laws.',
    status: 'available',
    model: 'Relativistic kinematics · Lorentz force · evaluated particle data',
    experimentCount: 5,
  },
  {
    id: 'black-hole',
    name: 'Black Hole Optics',
    field: 'General relativity',
    summary: 'Trace light near compact objects and separate physical lensing from artistic emission.',
    status: 'available',
    model: 'Schwarzschild null geodesics · Kerr extension planned',
    experimentCount: 5,
  },
  {
    id: 'quasar',
    name: 'Quasar Engine',
    field: 'Relativistic astrophysics',
    summary: 'Study how mass and accretion rate set the thermal structure of a luminous thin disk.',
    status: 'available',
    model: 'Zero-torque thin disk · Eddington scaling · local blackbody emission',
    experimentCount: 4,
  },
] as const;

export const getLab = (id: string | null): LabDefinition | undefined =>
  labs.find((lab) => lab.id === id);

export const getLabUrl = (id: LabId): string => `?lab=${id}`;
