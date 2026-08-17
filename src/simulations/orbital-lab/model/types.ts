export type Vector3Tuple = readonly [number, number, number];

export type BodyKind =
  | 'star'
  | 'terrestrial'
  | 'rocky'
  | 'gas-giant'
  | 'ice-giant'
  | 'black-hole'
  | 'neutron-star'
  | 'pulsar'
  | 'generic';

export type BodySurface =
  | 'sun'
  | 'earth'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'accretion-disk'
  | 'quasar'
  | 'neutron-star'
  | 'pulsar'
  | 'molten'
  | 'procedural'
  | 'none';

export interface BodyDefinition {
  readonly id: string;
  readonly name: string;
  readonly kind?: BodyKind;
  readonly surface?: BodySurface;
  readonly mass: number;
  /** Physical collision radius in the active simulation's distance unit. */
  readonly radius: number;
  /** Readability scale used only by the renderer. */
  readonly renderRadius?: number;
  readonly color: string;
  /** Axial tilt in radians. */
  readonly axialTilt?: number;
  /** Sidereal rotation in radians per simulation-time unit. */
  readonly rotationRate?: number;
  readonly position: Vector3Tuple;
  readonly velocity: Vector3Tuple;
}

export interface SimulationOptions {
  readonly gravitationalConstant?: number;
  readonly softening?: number;
  readonly collisions?: boolean;
  readonly gravitySolver?: 'auto' | 'direct' | 'barnes-hut';
  readonly gravityDirectThreshold?: number;
  readonly gravityOpeningAngle?: number;
}

export interface SimulationDiagnostics {
  readonly kineticEnergy: number;
  readonly potentialEnergy: number;
  readonly totalEnergy: number;
  readonly linearMomentum: Vector3Tuple;
  readonly angularMomentum: Vector3Tuple;
  readonly centerOfMass: Vector3Tuple;
}

export type CollisionOutcome =
  | 'merge'
  | 'hit-and-run'
  | 'disruption'
  | 'capture'
  | 'black-hole-merger';

export type CollisionVisualClass =
  | 'planetary-impact'
  | 'stellar-merger'
  | 'tidal-disruption'
  | 'horizon-capture'
  | 'compact-merger';

export interface CollisionEvent {
  readonly sequence: number;
  readonly time: number;
  readonly outcome: CollisionOutcome;
  readonly visualClass: CollisionVisualClass;
  readonly participants: readonly [string, string];
  readonly participantKinds: readonly [BodyKind, BodyKind];
  readonly participantColors: readonly [string, string];
  readonly participantVisualRadii: readonly [number, number];
  readonly impactSpeed: number;
  readonly mutualEscapeSpeed: number;
  readonly specificImpactEnergy: number;
  readonly disruptionThreshold: number;
  /** Centre-of-mass contact position in model coordinates. */
  readonly position: Vector3Tuple;
  /** Unit vector from the first participant toward the second at contact. */
  readonly normal: Vector3Tuple;
  readonly relativeVelocity: Vector3Tuple;
  /** Largest readability radius of the colliding pair. */
  readonly visualRadius: number;
  /** Characteristic unresolved ejecta speed in model units per time unit. */
  readonly ejectaSpeed: number;
  readonly fragmentCount: number;
  readonly radiatedMass: number;
}
