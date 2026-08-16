export type Vector3Tuple = readonly [number, number, number];

export interface BodyDefinition {
  readonly id: string;
  readonly name: string;
  readonly mass: number;
  readonly radius: number;
  readonly color: string;
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

