import type { SimulationDiagnostics } from './model/types';

export interface BodyMetadata {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly mass: number;
  readonly radius: number;
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

export type WorkerRequest =
  | InitializeRequest
  | AdvanceRequest
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
}

export interface FrameResponse {
  readonly type: 'frame';
  readonly session: number;
  readonly time: number;
  readonly positions: ArrayBuffer;
  readonly diagnostics: SimulationDiagnostics;
  readonly droppedTime: number;
}

export interface ErrorResponse {
  readonly type: 'error';
  readonly session: number;
  readonly message: string;
}

export type WorkerResponse = InitializedResponse | FrameResponse | ErrorResponse;

