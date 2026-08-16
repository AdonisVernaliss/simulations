import { getPreset, presets } from './model/presets';
import {
  OrbitalRenderer,
  type QualityLevel,
} from './renderer/orbital-renderer';
import {
  SimulationWorkerClient,
  type SimulationDetails,
  type SimulationFrame,
} from './simulation-worker-client';

type QualityMode = QualityLevel | 'auto';

const requireElement = <ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType => {
  const element = root.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`Required interface element is missing: ${selector}`);
  }
  return element;
};

const formatNumber = (value: number, maximumFractionDigits = 2): string =>
  new Intl.NumberFormat('en', { maximumFractionDigits }).format(value);

export class OrbitalLab {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: OrbitalRenderer;
  private readonly worker: SimulationWorkerClient;
  private readonly presetSelect: HTMLSelectElement;
  private readonly speedSelect: HTMLSelectElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly resetButton: HTMLButtonElement;
  private readonly addBodyButton: HTMLButtonElement;
  private readonly bodyDialog: HTMLDialogElement;
  private readonly bodyForm: HTMLFormElement;
  private readonly bodyFormError: HTMLElement;
  private readonly statusElement: HTMLElement;
  private readonly titleElement: HTMLElement;
  private readonly summaryElement: HTMLElement;
  private readonly timeElement: HTMLElement;
  private readonly fpsElement: HTMLElement;
  private readonly bodyCountElement: HTMLElement;
  private readonly energyDriftElement: HTMLElement;
  private readonly momentumElement: HTMLElement;
  private readonly qualityActiveElement: HTMLElement;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private animationFrame = 0;
  private lastTimestamp = performance.now();
  private lastMetricsUpdate = 0;
  private framesPerSecond = 60;
  private initialEnergy = 0;
  private activePresetId: string = presets[0].id;
  private paused = false;
  private qualityMode: QualityMode = 'auto';
  private activeQuality: QualityLevel = 'balanced';
  private slowFrameTime = 0;
  private fastFrameTime = 0;
  private bodyCount = 0;
  private customBodySequence = 0;

  constructor(root: HTMLElement) {
    root.innerHTML = this.createMarkup();
    this.canvas = requireElement(root, '[data-canvas]');
    this.presetSelect = requireElement(root, '[data-preset]');
    this.speedSelect = requireElement(root, '[data-speed]');
    this.qualitySelect = requireElement(root, '[data-quality]');
    this.pauseButton = requireElement(root, '[data-pause]');
    this.resetButton = requireElement(root, '[data-reset]');
    this.addBodyButton = requireElement(root, '[data-add-body]');
    this.bodyDialog = requireElement(root, '[data-body-dialog]');
    this.bodyForm = requireElement(root, '[data-body-form]');
    this.bodyFormError = requireElement(root, '[data-body-error]');
    this.statusElement = requireElement(root, '[data-status]');
    this.titleElement = requireElement(root, '[data-title]');
    this.summaryElement = requireElement(root, '[data-summary]');
    this.timeElement = requireElement(root, '[data-time]');
    this.fpsElement = requireElement(root, '[data-fps]');
    this.bodyCountElement = requireElement(root, '[data-body-count]');
    this.energyDriftElement = requireElement(root, '[data-energy-drift]');
    this.momentumElement = requireElement(root, '[data-momentum]');
    this.qualityActiveElement = requireElement(root, '[data-quality-active]');

    this.renderer = new OrbitalRenderer(this.canvas);
    this.worker = new SimulationWorkerClient({
      onInitialized: (details, frame) => this.handleInitialized(details, frame),
      onFrame: (frame) => this.handleFrame(frame),
      onError: (message) => this.setStatus(message, 'error'),
    });

    this.populatePresets();
    this.bindControls();

    if (this.reducedMotion) {
      this.activeQuality = 'low';
      this.renderer.setQuality('low');
    }
    this.updateQualityLabel();
  }

  start(): void {
    this.setStatus('Loading model', 'loading');
    this.worker.initialize(this.activePresetId);
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.worker.destroy();
    this.renderer.destroy();
  }

  private readonly tick = (timestamp: number): void => {
    const elapsedSeconds = Math.min((timestamp - this.lastTimestamp) / 1_000, 0.25);
    this.lastTimestamp = timestamp;

    if (elapsedSeconds > 0) {
      const instantaneousFps = 1 / elapsedSeconds;
      this.framesPerSecond += (instantaneousFps - this.framesPerSecond) * 0.06;
      this.adjustAutomaticQuality(elapsedSeconds);
    }

    if (!this.paused && !document.hidden) {
      this.worker.advance(elapsedSeconds);
    }

    this.renderer.render();
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private handleInitialized(details: SimulationDetails, frame: SimulationFrame): void {
    const preset = getPreset(details.presetId);
    this.activePresetId = details.presetId;
    this.initialEnergy = frame.diagnostics.totalEnergy;
    this.renderer.setBodies(
      details.bodies,
      frame.positions,
      preset.cameraDistance,
      preset.trailSpan,
    );
    this.titleElement.textContent = details.presetName;
    this.summaryElement.textContent = details.presetSummary;
    this.bodyCountElement.textContent = String(details.bodies.length);
    this.bodyCount = details.bodies.length;
    this.presetSelect.value = details.presetId;
    this.updateMetrics(frame, true);
    this.setStatus(this.paused ? 'Paused' : 'Running', this.paused ? 'paused' : 'running');
  }

  private handleFrame(frame: SimulationFrame): void {
    this.renderer.update(frame.positions, frame.time);
    this.updateMetrics(frame);

    if (frame.droppedTime > 0.01 && this.qualityMode === 'auto') {
      this.reduceQuality();
    }
  }

  private updateMetrics(frame: SimulationFrame, force = false): void {
    const now = performance.now();
    if (!force && now - this.lastMetricsUpdate < 200) {
      return;
    }

    const energyDenominator = Math.max(Math.abs(this.initialEnergy), Number.EPSILON);
    const energyDrift =
      (Math.abs(frame.diagnostics.totalEnergy - this.initialEnergy) / energyDenominator) * 100;
    const momentum = Math.hypot(...frame.diagnostics.linearMomentum);

    this.timeElement.textContent = formatNumber(frame.time, 2);
    this.fpsElement.textContent = formatNumber(this.framesPerSecond, 0);
    this.energyDriftElement.textContent = `${energyDrift.toExponential(1)}%`;
    this.momentumElement.textContent = momentum.toExponential(2);
    this.lastMetricsUpdate = now;
  }

  private bindControls(): void {
    this.presetSelect.addEventListener('change', () => {
      this.activePresetId = this.presetSelect.value;
      this.setStatus('Loading model', 'loading');
      this.worker.initialize(this.activePresetId);
    });

    this.pauseButton.addEventListener('click', () => this.togglePaused());

    this.resetButton.addEventListener('click', () => {
      this.setStatus('Resetting model', 'loading');
      this.worker.initialize(this.activePresetId);
    });

    this.addBodyButton.addEventListener('click', () => {
      const nameInput = requireElement<HTMLInputElement>(this.bodyForm, '[name="name"]');
      nameInput.value = `Body ${this.bodyCount + 1}`;
      this.bodyFormError.textContent = '';
      this.bodyDialog.showModal();
      nameInput.focus();
      nameInput.select();
    });

    this.bodyForm.addEventListener('submit', (event) => {
      event.preventDefault();

      if (!this.bodyForm.reportValidity()) {
        return;
      }

      const values = new FormData(this.bodyForm);
      const readNumber = (name: string): number => Number(values.get(name));
      const name = String(values.get('name') ?? '').trim();
      const mass = readNumber('mass');
      const radius = readNumber('radius');
      const positionX = readNumber('position-x');
      const positionY = readNumber('position-y');
      const velocityX = readNumber('velocity-x');
      const velocityY = readNumber('velocity-y');
      const color = String(values.get('color') ?? '#79d9ff');
      const numericValues = [mass, radius, positionX, positionY, velocityX, velocityY];

      if (!name || numericValues.some((value) => !Number.isFinite(value))) {
        this.bodyFormError.textContent = 'Enter a name and finite numeric values.';
        return;
      }

      this.customBodySequence += 1;
      this.worker.addBody({
        id: `custom-${this.customBodySequence}`,
        name,
        mass,
        radius,
        color,
        position: [positionX, positionY, 0],
        velocity: [velocityX, velocityY, 0],
      });
      this.setStatus('Adding body', 'loading');
      this.bodyDialog.close();
    });

    this.bodyDialog.querySelectorAll<HTMLButtonElement>('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => this.bodyDialog.close());
    });

    this.speedSelect.addEventListener('change', () => {
      this.worker.setTimeScale(Number(this.speedSelect.value));
    });

    this.qualitySelect.addEventListener('change', () => {
      this.qualityMode = this.qualitySelect.value as QualityMode;
      if (this.qualityMode === 'auto') {
        this.applyQuality(this.reducedMotion ? 'low' : 'balanced');
      } else {
        this.applyQuality(this.qualityMode);
      }
    });

    document.addEventListener('visibilitychange', () => {
      this.lastTimestamp = performance.now();
      this.worker.setPaused(document.hidden || this.paused);
    });

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const isInteractive =
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement;

      if (event.code === 'Space' && !isInteractive) {
        event.preventDefault();
        this.togglePaused();
      }
    });

    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.setStatus('Graphics context lost', 'error');
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      this.setStatus('Restoring model', 'loading');
      this.worker.initialize(this.activePresetId);
    });
  }

  private togglePaused(): void {
    this.paused = !this.paused;
    this.worker.setPaused(this.paused);
    this.pauseButton.textContent = this.paused ? 'Resume' : 'Pause';
    this.pauseButton.setAttribute('aria-pressed', String(this.paused));
    this.setStatus(this.paused ? 'Paused' : 'Running', this.paused ? 'paused' : 'running');
    this.lastTimestamp = performance.now();
  }

  private adjustAutomaticQuality(elapsedSeconds: number): void {
    if (this.qualityMode !== 'auto') {
      return;
    }

    if (this.framesPerSecond < 44) {
      this.slowFrameTime += elapsedSeconds;
      this.fastFrameTime = 0;
    } else if (this.framesPerSecond > 57) {
      this.fastFrameTime += elapsedSeconds;
      this.slowFrameTime = 0;
    } else {
      this.slowFrameTime = Math.max(0, this.slowFrameTime - elapsedSeconds);
      this.fastFrameTime = Math.max(0, this.fastFrameTime - elapsedSeconds);
    }

    if (this.slowFrameTime > 2.5) {
      this.reduceQuality();
    } else if (this.fastFrameTime > 12 && !this.reducedMotion) {
      const nextQuality = this.activeQuality === 'low' ? 'balanced' : 'high';
      this.applyQuality(nextQuality);
    }
  }

  private reduceQuality(): void {
    const nextQuality = this.activeQuality === 'high' ? 'balanced' : 'low';
    this.applyQuality(nextQuality);
  }

  private applyQuality(quality: QualityLevel): void {
    if (quality === this.activeQuality) {
      this.slowFrameTime = 0;
      this.fastFrameTime = 0;
      return;
    }

    this.activeQuality = quality;
    this.renderer.setQuality(quality);
    this.slowFrameTime = 0;
    this.fastFrameTime = 0;
    this.updateQualityLabel();
  }

  private updateQualityLabel(): void {
    this.qualityActiveElement.textContent = this.activeQuality;
  }

  private setStatus(message: string, state: string): void {
    this.statusElement.textContent = message;
    this.statusElement.dataset.state = state;
  }

  private populatePresets(): void {
    this.presetSelect.replaceChildren(
      ...presets.map((preset) => {
        const option = document.createElement('option');
        option.value = preset.id;
        option.textContent = preset.name;
        return option;
      }),
    );
    this.presetSelect.value = this.activePresetId;
  }

  private createMarkup(): string {
    return `
      <article class="lab-shell">
        <header class="topbar">
          <div class="brand" aria-label="Orbital Mechanics Lab">
            <span class="brand-mark" aria-hidden="true">
              <span></span>
            </span>
            <span>Orbital Mechanics Lab</span>
          </div>
          <div class="status" data-status data-state="loading" role="status">Loading model</div>
        </header>

        <section class="viewport" aria-label="Interactive orbital simulation">
          <canvas data-canvas aria-label="Three-dimensional view of orbiting bodies"></canvas>

          <div class="scene-heading">
            <p class="eyebrow">Active system</p>
            <h1 data-title>Solar system</h1>
            <p data-summary>Loading orbital model…</p>
          </div>

          <aside class="metrics" aria-label="Live physical diagnostics">
            <div class="metric metric-primary">
              <span>Simulation time</span>
              <strong><span data-time>0.00</span> <small>units</small></strong>
            </div>
            <div class="metric-grid">
              <div class="metric">
                <span>Frame rate</span>
                <strong><span data-fps>—</span> <small>fps</small></strong>
              </div>
              <div class="metric">
                <span>Bodies</span>
                <strong data-body-count>—</strong>
              </div>
              <div class="metric">
                <span>Energy drift</span>
                <strong data-energy-drift>—</strong>
              </div>
              <div class="metric">
                <span>Momentum</span>
                <strong data-momentum>—</strong>
              </div>
            </div>
            <p class="quality-note">Rendering: <span data-quality-active>balanced</span></p>
          </aside>

          <div class="hint" aria-hidden="true">Drag to orbit · Scroll to zoom · Space to pause</div>

          <div class="control-dock" aria-label="Simulation controls">
            <label class="field field-preset">
              <span>System</span>
              <select data-preset aria-label="Orbital system"></select>
            </label>

            <div class="transport">
              <button class="button button-primary" type="button" data-pause aria-pressed="false">
                Pause
              </button>
              <button class="button" type="button" data-reset>Reset</button>
              <button class="button" type="button" data-add-body>Add body</button>
            </div>

            <label class="field">
              <span>Speed</span>
              <select data-speed aria-label="Simulation speed">
                <option value="0.25">0.25×</option>
                <option value="0.5">0.5×</option>
                <option value="1" selected>1×</option>
                <option value="2">2×</option>
                <option value="4">4×</option>
              </select>
            </label>

            <label class="field">
              <span>Quality</span>
              <select data-quality aria-label="Rendering quality">
                <option value="auto" selected>Auto</option>
                <option value="low">Low</option>
                <option value="balanced">Balanced</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        </section>

        <dialog class="body-dialog" data-body-dialog>
          <form class="body-form" data-body-form>
            <header>
              <div>
                <p class="eyebrow">Initial conditions</p>
                <h2>Add an orbiting body</h2>
              </div>
              <button class="dialog-close" type="button" aria-label="Close" data-close-dialog>×</button>
            </header>

            <label class="form-field form-field-wide">
              <span>Name</span>
              <input name="name" maxlength="32" required />
            </label>
            <label class="form-field">
              <span>Mass</span>
              <input name="mass" type="number" value="0.001" min="0.000000001" max="10" step="any" required />
            </label>
            <label class="form-field">
              <span>Visual radius</span>
              <input name="radius" type="number" value="0.07" min="0.005" max="0.5" step="any" required />
            </label>
            <label class="form-field">
              <span>Position X</span>
              <input name="position-x" type="number" value="2" min="-50" max="50" step="any" required />
            </label>
            <label class="form-field">
              <span>Position Y</span>
              <input name="position-y" type="number" value="0" min="-50" max="50" step="any" required />
            </label>
            <label class="form-field">
              <span>Velocity X</span>
              <input name="velocity-x" type="number" value="0" min="-20" max="20" step="any" required />
            </label>
            <label class="form-field">
              <span>Velocity Y</span>
              <input name="velocity-y" type="number" value="0.7" min="-20" max="20" step="any" required />
            </label>
            <label class="form-field form-field-wide color-field">
              <span>Color</span>
              <input name="color" type="color" value="#79d9ff" />
            </label>

            <p class="form-error" data-body-error role="alert"></p>
            <footer>
              <button class="button" type="button" data-close-dialog>Cancel</button>
              <button class="button button-primary" type="submit">Add to simulation</button>
            </footer>
          </form>
        </dialog>
      </article>
    `;
  }
}
