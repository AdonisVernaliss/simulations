export type Vector3Tuple = readonly [number, number, number];

export type BodyKind =
  | 'star'
  | 'terrestrial'
  | 'rocky'
  | 'gas-giant'
  | 'ice-giant'
  | 'black-hole'
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
}

export interface SimulationDiagnostics {
  readonly kineticEnergy: number;
  readonly potentialEnergy: number;
  readonly totalEnergy: number;
  readonly linearMomentum: Vector3Tuple;
  readonly angularMomentum: Vector3Tuple;
  readonly centerOfMass: Vector3Tuple;
}
