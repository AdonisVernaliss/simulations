import type {
  BodyDefinition,
  BodyKind,
  BodySurface,
  CollisionEvent,
  SimulationDiagnostics,
} from './model/types';

export interface BodyMetadata {
  readonly id: string;
  readonly name: string;
  readonly kind: BodyKind;
  readonly surface: BodySurface;
  readonly color: string;
  readonly mass: number;
  readonly radius: number;
  readonly renderRadius: number;
  readonly axialTilt: number;
  readonly rotationRate: number;
}

export interface InitializeRequest {
  readonly type: 'initialize';
  readonly session: number;
  readonly presetId: string;
}

export interface AdvanceRequest {
  readonly type: 'advance';
  readonly session: number;
  readonly elapsedSeconds: number;
  readonly positionBuffer?: ArrayBuffer;
}

export interface PauseRequest {
  readonly type: 'set-paused';
  readonly session: number;
  readonly paused: boolean;
}

export interface TimeScaleRequest {
  readonly type: 'set-time-scale';
  readonly session: number;
  readonly multiplier: number;
}

export interface AddBodyRequest {
  readonly type: 'add-body';
  readonly session: number;
  readonly body: BodyDefinition;
}

export type WorkerRequest =
  | InitializeRequest
  | AdvanceRequest
  | AddBodyRequest
  | PauseRequest
  | TimeScaleRequest;

export interface InitializedResponse {
  readonly type: 'initialized';
  readonly session: number;
  readonly presetId: string;
  readonly presetName: string;
  readonly presetSummary: string;
  readonly bodies: readonly BodyMetadata[];
  readonly time: number;
  readonly positions: ArrayBuffer;
  readonly diagnostics: SimulationDiagnostics;
  readonly collision?: CollisionEvent;
}

export interface FrameResponse {
  readonly type: 'frame';
  readonly session: number;
  readonly time: number;
  readonly positions: ArrayBuffer;
  readonly diagnostics: SimulationDiagnostics;
  readonly droppedTime: number;
  readonly collision?: CollisionEvent;
}

export interface ErrorResponse {
  readonly type: 'error';
  readonly session: number;
  readonly message: string;
}

export type WorkerResponse = InitializedResponse | FrameResponse | ErrorResponse;
