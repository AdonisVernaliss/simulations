/// <reference lib="webworker" />

import { FixedStepClock } from '../../core/fixed-step';
import { NBodySimulation } from './model/n-body';
import { getPreset, type SimulationPreset } from './model/presets';
import { physicalWarpToModelRate } from './model/time-scale';
import type { SimulationDiagnostics } from './model/types';
import type {
  AdvanceRequest,
  BodyMetadata,
  WorkerRequest,
  WorkerResponse,
} from './worker-protocol';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

let activeSession = 0;
let activePreset: SimulationPreset | undefined;
let simulation: NBodySimulation | undefined;
let clock: FixedStepClock | undefined;
let paused = false;
let timeWarp = 1;
let diagnostics: SimulationDiagnostics | undefined;
let diagnosticsElapsedSeconds = 0;

const createPositionBuffer = (
  source: Float64Array,
  recycledBuffer?: ArrayBuffer,
): ArrayBuffer => {
  const requiredBytes = source.length * Float32Array.BYTES_PER_ELEMENT;
  const buffer =
    recycledBuffer?.byteLength === requiredBytes
      ? recycledBuffer
      : new ArrayBuffer(requiredBytes);
  const output = new Float32Array(buffer);

  for (let index = 0; index < source.length; index += 1) {
    output[index] = source[index]!;
  }

  return buffer;
};

const postWithPositions = (response: WorkerResponse, positions: ArrayBuffer): void => {
  workerScope.postMessage(response, [positions]);
};

const getBodyMetadata = (activeSimulation: NBodySimulation): BodyMetadata[] =>
  activeSimulation.ids.map((id, index) => ({
    id,
    name: activeSimulation.names[index]!,
    kind: activeSimulation.kinds[index]!,
    surface: activeSimulation.surfaces[index]!,
    color: activeSimulation.colors[index]!,
    mass: activeSimulation.masses[index]!,
    radius: activeSimulation.radii[index]!,
    renderRadius: activeSimulation.renderRadii[index]!,
    axialTilt: activeSimulation.axialTilts[index]!,
    rotationRate: activeSimulation.rotationRates[index]!,
  }));

const postInitialized = (recycledBuffer?: ArrayBuffer): void => {
  if (simulation === undefined || activePreset === undefined) {
    return;
  }

  const positions = createPositionBuffer(simulation.positions, recycledBuffer);
  diagnostics = simulation.getDiagnostics();
  diagnosticsElapsedSeconds = 0;

  postWithPositions(
    {
      type: 'initialized',
      session: activeSession,
      presetId: activePreset.id,
      presetName: activePreset.name,
      presetSummary: activePreset.summary,
      bodies: getBodyMetadata(simulation),
      time: simulation.time,
      positions,
      diagnostics,
      collision: simulation.lastCollisionEvent,
    },
    positions,
  );
};

const initialize = (session: number, presetId: string): void => {
  activeSession = session;
  activePreset = getPreset(presetId);
  simulation = new NBodySimulation(activePreset.bodies, {
    collisions: true,
    gravitationalConstant: 1,
    softening: 0.0001,
  });
  clock = new FixedStepClock(activePreset.fixedStep, 16);
  paused = false;
  timeWarp = activePreset.defaultTimeWarp;
  postInitialized();
};

const advance = (request: AdvanceRequest): void => {
  if (
    request.session !== activeSession ||
    simulation === undefined ||
    clock === undefined ||
    activePreset === undefined
  ) {
    return;
  }

  const previousBodyCount = simulation.count;
  const elapsedSeconds = Math.min(request.elapsedSeconds, 0.25);
  const modelUnitsPerSecond = paused
    ? 0
    : physicalWarpToModelRate(timeWarp, activePreset.secondsPerTimeUnit);
  const requestedModelTime = elapsedSeconds * modelUnitsPerSecond;
  const result =
    requestedModelTime > 0 && requestedModelTime < activePreset.fixedStep
      ? (() => {
          simulation?.step(requestedModelTime);
          return { droppedTime: 0 };
        })()
      : clock.advance(
          elapsedSeconds,
          modelUnitsPerSecond,
          (deltaTime) => simulation?.step(deltaTime),
        );

  if (simulation.count !== previousBodyCount) {
    postInitialized(request.positionBuffer);
    return;
  }

  const positions = createPositionBuffer(simulation.positions, request.positionBuffer);
  diagnosticsElapsedSeconds += elapsedSeconds;
  if (diagnostics === undefined || diagnosticsElapsedSeconds >= 0.2) {
    diagnostics = simulation.getDiagnostics();
    diagnosticsElapsedSeconds = 0;
  }

  postWithPositions(
    {
      type: 'frame',
      session: activeSession,
      time: simulation.time,
      positions,
      diagnostics,
      droppedTime: result.droppedTime,
      collision: simulation.lastCollisionEvent,
    },
    positions,
  );
};

workerScope.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  const request = event.data;

  try {
    switch (request.type) {
      case 'initialize':
        initialize(request.session, request.presetId);
        break;
      case 'advance':
        advance(request);
        break;
      case 'add-body':
        if (request.session === activeSession && simulation !== undefined) {
          if (simulation.count >= 128) {
            throw new RangeError('The interactive body limit is 128');
          }
          simulation.addBody(request.body);
          postInitialized();
        }
        break;
      case 'set-paused':
        if (request.session === activeSession) {
          paused = request.paused;
        }
        break;
      case 'set-time-scale':
        if (
          request.session === activeSession &&
          Number.isFinite(request.multiplier) &&
          request.multiplier >= 0
        ) {
          timeWarp = request.multiplier;
          clock?.reset();
        }
        break;
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: 'error',
      session: request.session,
      message: error instanceof Error ? error.message : 'Unknown simulation error',
    };
    workerScope.postMessage(response);
  }
};
