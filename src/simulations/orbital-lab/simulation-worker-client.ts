import type {
  BodyMetadata,
  InitializedResponse,
  WorkerRequest,
  WorkerResponse,
} from './worker-protocol';
import type { CollisionEvent, SimulationDiagnostics } from './model/types';
import type { BodyDefinition } from './model/types';
import type { GravityAlgorithm } from './model/gravity-solver';

export interface SimulationFrame {
  readonly time: number;
  readonly positions: Float32Array;
  readonly diagnostics: SimulationDiagnostics;
  readonly gravityAlgorithm: GravityAlgorithm;
  readonly droppedTime: number;
  readonly collision?: CollisionEvent;
}

export interface SimulationDetails {
  readonly presetId: string;
  readonly presetName: string;
  readonly presetSummary: string;
  readonly bodies: readonly BodyMetadata[];
}

export interface SimulationWorkerHandlers {
  readonly onInitialized: (details: SimulationDetails, frame: SimulationFrame) => void;
  readonly onFrame: (frame: SimulationFrame) => void;
  readonly onError: (message: string) => void;
}

export class SimulationWorkerClient {
  private readonly worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
    type: 'module',
    name: 'orbital-physics',
  });

  private session = 0;
  private positionBuffer: ArrayBuffer | undefined;
  private frameInFlight = false;
  private initialized = false;

  constructor(private readonly handlers: SimulationWorkerHandlers) {
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleMessage(event.data);
    };

    this.worker.onerror = () => {
      this.frameInFlight = false;
      this.handlers.onError('The physics worker stopped unexpectedly.');
    };
  }

  initialize(presetId: string): void {
    this.session += 1;
    this.initialized = false;
    this.frameInFlight = false;
    this.positionBuffer = undefined;
    this.post({ type: 'initialize', session: this.session, presetId });
  }

  advance(elapsedSeconds: number): void {
    if (!this.initialized || this.frameInFlight || this.positionBuffer === undefined) {
      return;
    }

    const positionBuffer = this.positionBuffer;
    this.positionBuffer = undefined;
    this.frameInFlight = true;
    const request: WorkerRequest = {
      type: 'advance',
      session: this.session,
      elapsedSeconds,
      positionBuffer,
    };
    this.worker.postMessage(request, [positionBuffer]);
  }

  setPaused(paused: boolean): void {
    this.post({ type: 'set-paused', session: this.session, paused });
  }

  setTimeScale(multiplier: number): void {
    this.post({ type: 'set-time-scale', session: this.session, multiplier });
  }

  addBody(body: BodyDefinition): void {
    this.initialized = false;
    this.post({ type: 'add-body', session: this.session, body });
  }

  destroy(): void {
    this.worker.terminate();
    this.positionBuffer = undefined;
    this.initialized = false;
  }

  private post(request: WorkerRequest): void {
    this.worker.postMessage(request);
  }

  private handleMessage(response: WorkerResponse): void {
    if (response.session !== this.session) {
      return;
    }

    if (response.type === 'error') {
      this.frameInFlight = false;
      this.handlers.onError(response.message);
      return;
    }

    this.positionBuffer = response.positions;
    this.frameInFlight = false;
    const frame: SimulationFrame = {
      time: response.time,
      positions: new Float32Array(response.positions),
      diagnostics: response.diagnostics,
      gravityAlgorithm: response.gravityAlgorithm,
      droppedTime: response.type === 'frame' ? response.droppedTime : 0,
      collision: response.collision,
    };

    if (response.type === 'initialized') {
      this.initialized = true;
      this.handlers.onInitialized(this.getDetails(response), frame);
    } else {
      this.handlers.onFrame(frame);
    }
  }

  private getDetails(response: InitializedResponse): SimulationDetails {
    return {
      presetId: response.presetId,
      presetName: response.presetName,
      presetSummary: response.presetSummary,
      bodies: response.bodies,
    };
  }
}
