export interface FixedStepResult {
  readonly steps: number;
  readonly interpolation: number;
  readonly droppedTime: number;
}

export class FixedStepClock {
  private accumulator = 0;

  constructor(
    readonly stepSize: number,
    readonly maximumSteps = 12,
  ) {
    if (!Number.isFinite(stepSize) || stepSize <= 0) {
      throw new RangeError('Step size must be positive and finite');
    }

    if (!Number.isInteger(maximumSteps) || maximumSteps < 1) {
      throw new RangeError('Maximum steps must be a positive integer');
    }
  }

  advance(
    elapsedSeconds: number,
    timeScale: number,
    step: (deltaTime: number) => void,
  ): FixedStepResult {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
      throw new RangeError('Elapsed time must be finite and non-negative');
    }

    if (!Number.isFinite(timeScale) || timeScale < 0) {
      throw new RangeError('Time scale must be finite and non-negative');
    }

    const requestedTime = elapsedSeconds * timeScale;
    const maximumAccumulatedTime = this.stepSize * this.maximumSteps;
    const acceptedTime = Math.min(requestedTime, maximumAccumulatedTime);
    const droppedTime = requestedTime - acceptedTime;
    this.accumulator = Math.min(this.accumulator + acceptedTime, maximumAccumulatedTime);

    const roundingTolerance = this.stepSize * 1e-12;
    const steps = Math.min(
      this.maximumSteps,
      Math.floor((this.accumulator + roundingTolerance) / this.stepSize),
    );

    for (let index = 0; index < steps; index += 1) {
      step(this.stepSize);
    }

    this.accumulator = Math.max(0, this.accumulator - steps * this.stepSize);

    return {
      steps,
      interpolation: this.accumulator / this.stepSize,
      droppedTime,
    };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
