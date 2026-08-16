export type LabId = 'orbital' | 'atomic' | 'particle' | 'black-hole' | 'quasar';

export interface LabDefinition {
  readonly id: LabId;
  readonly name: string;
  readonly field: string;
  readonly summary: string;
  readonly status: 'available' | 'research';
  readonly model: string;
}

export const labs: readonly LabDefinition[] = [
  {
    id: 'orbital',
    name: 'Orbital Mechanics',
    field: 'Classical mechanics',
    summary: 'Build and inspect gravitational systems in a real-time Newtonian N-body sandbox.',
    status: 'available',
    model: 'Newtonian point masses · velocity Verlet · inelastic merging',
  },
  {
    id: 'atomic',
    name: 'Atomic Orbitals',
    field: 'Quantum mechanics',
    summary: 'Explore stationary hydrogenic states as probability densities rather than particle paths.',
    status: 'available',
    model: 'Coulomb Schrödinger equation · analytic hydrogenic eigenstates',
  },
  {
    id: 'particle',
    name: 'Particle Physics',
    field: 'High-energy physics',
    summary: 'Inspect relativistic charged-particle tracks, decays, and conservation laws.',
    status: 'research',
    model: 'Relativistic kinematics · Lorentz force · evaluated particle data',
  },
  {
    id: 'black-hole',
    name: 'Black Hole Optics',
    field: 'General relativity',
    summary: 'Trace light near compact objects and separate physical lensing from artistic emission.',
    status: 'research',
    model: 'Schwarzschild null geodesics · Kerr extension planned',
  },
  {
    id: 'quasar',
    name: 'Quasar Engine',
    field: 'Relativistic astrophysics',
    summary: 'Study accretion, temperature profiles, relativistic transfer, and jet assumptions.',
    status: 'research',
    model: 'Thin-disc baseline · radiative transfer · explicit phenomenology',
  },
] as const;

export const getLab = (id: string | null): LabDefinition | undefined =>
  labs.find((lab) => lab.id === id);

export const getLabUrl = (id: LabId): string => `?lab=${id}`;
