import {
  GuidedExperiments,
  type GuidedExperiment,
} from '../../core/guided-experiments';
import { getPreset, presets } from './model/presets';
import type { CollisionEvent } from './model/types';
import { modelTimeToPhysicalSeconds } from './model/time-scale';
import {
  OrbitalRenderer,
  type BodySelection,
  type QualityLevel,
} from './renderer/orbital-renderer';
import type { BodyMetadata } from './worker-protocol';
import {
  SimulationWorkerClient,
  type SimulationDetails,
  type SimulationFrame,
} from './simulation-worker-client';

type QualityMode = QualityLevel | 'auto';
type OrbitalExperimentId =
  | 'solar-system'
  | 'black-hole-flyby'
  | 'black-hole-binary'
  | 'black-hole-merger'
  | 'accreting-black-hole'
  | 'quasar-system'
  | 'pulsar-system'
  | 'neutron-star-binary'
  | 'tidal-encounter'
  | 'binary-stars'
  | 'figure-eight'
  | 'head-on-collision';

const ORBITAL_EXPERIMENTS: readonly GuidedExperiment<OrbitalExperimentId>[] = [
  {
    id: 'solar-system',
    label: 'Planetary system',
    title: 'Distance sets the orbital clock',
    question: 'Why do inner planets complete orbits sooner?',
    observation: 'Compare trail motion: circular speed scales as r⁻¹⁄² and period as r³⁄².',
  },
  {
    id: 'black-hole-flyby',
    label: 'Black hole flyby',
    title: 'One encounter reshapes a whole system',
    question: 'Can a black hole alter a planet without swallowing it?',
    observation: 'Watch each body exchange energy with the intruder: capture is only one possible outcome.',
  },
  {
    id: 'black-hole-binary',
    label: 'Black hole + star',
    title: 'Orbit in a combined gravitational field',
    question: 'What do distant worlds orbit when the centre contains two moving masses?',
    observation: 'The star and black hole orbit their barycentre; the outer worlds respond to both at every step.',
  },
  {
    id: 'black-hole-merger',
    label: 'Black hole merger',
    title: 'Horizons combine and radiate energy',
    question: 'Why is the final black hole lighter than the two initial masses added together?',
    observation: 'The retained remnant carries momentum; the event card reports the estimated mass-equivalent gravitational radiation.',
  },
  {
    id: 'accreting-black-hole',
    label: 'Accreting black hole',
    title: 'Light maps curved spacetime',
    question: 'Why can the rear face of a thin disk appear above and below the shadow?',
    observation: 'Orbit the camera: precomputed Schwarzschild null geodesics bend rays from both sides of the disk into view around a 2.598 rₛ shadow.',
  },
  {
    id: 'quasar-system',
    label: 'Active nucleus',
    title: 'A quasar belongs inside a gravitational system',
    question: 'Do the disk and jets add a new gravitational source?',
    observation: 'No: nearby bodies accelerate toward the massive black hole. The luminous disk and idealized jets visualize accretion activity.',
  },
  {
    id: 'pulsar-system',
    label: 'Pulsar system',
    title: 'A rotating neutron star acts as both beacon and mass',
    question: 'Why do the beams sweep while the planets orbit?',
    observation: 'Rotation moves the magnetic-axis emission pattern; orbital motion follows the pulsar mass through the same N-body solver.',
  },
  {
    id: 'neutron-star-binary',
    label: 'Neutron-star binary',
    title: 'Compact stars orbit a shared barycentre',
    question: 'Does either dense star remain fixed?',
    observation: 'No. Both objects carry mass and both accelerate; relativistic inspiral is deliberately outside this Newtonian scene.',
  },
  {
    id: 'tidal-encounter',
    label: 'Tidal encounter',
    title: 'A gravity gradient stretches a star',
    question: 'When does a star stop behaving like one rigid sphere?',
    observation: 'Stretching grows with 2MᴮᴴR³/(md³). Near unity, the leading tidal gradient rivals the star’s own surface gravity.',
  },
  {
    id: 'binary-stars',
    label: 'Binary stars',
    title: 'Orbit a shared center of mass',
    question: 'What does each equal star orbit when neither is fixed?',
    observation: 'Both stars remain opposite and circle the stationary barycentre between them.',
  },
  {
    id: 'figure-eight',
    label: 'Three-body orbit',
    title: 'A rare periodic three-body choreography',
    question: 'Can three gravitating bodies repeat one shared path?',
    observation: 'With special initial conditions, equal bodies follow the same figure eight in phase order.',
  },
  {
    id: 'head-on-collision',
    label: 'Planet accretion',
    title: 'Merge below the disruption threshold',
    question: 'Which quantities survive a low-energy planetary collision?',
    observation: 'Total mass and linear momentum remain; kinetic energy is converted and is not conserved.',
  },
] as const;

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

const formatMeasurement = (value: number): string =>
  Math.abs(value) < 0.001 && value !== 0 ? value.toExponential(3) : formatNumber(value, 4);

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${formatNumber(seconds, 1)} s`;
  if (seconds < 3_600) return `${formatNumber(seconds / 60, 2)} min`;
  if (seconds < 86_400) return `${formatNumber(seconds / 3_600, 2)} h`;
  if (seconds < 31_557_600) return `${formatNumber(seconds / 86_400, 2)} d`;
  return `${formatNumber(seconds / 31_557_600, 3)} yr`;
};

const getInitialPresetId = (): string => {
  const requested = new URLSearchParams(window.location.search).get('preset');
  return presets.some((preset) => preset.id === requested) ? requested! : presets[0].id;
};

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
  private readonly vectorsButton: HTMLButtonElement;
  private readonly fieldButton: HTMLButtonElement;
  private readonly systemViewButton: HTMLButtonElement;
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
  private readonly solverActiveElement: HTMLElement;
  private readonly collisionNotice: HTMLElement;
  private readonly closeCollisionButton: HTMLButtonElement;
  private readonly collisionTitle: HTMLElement;
  private readonly collisionDetail: HTMLElement;
  private readonly bodyListElement: HTMLElement;
  private readonly inspectorElement: HTMLElement;
  private readonly selectedNameElement: HTMLElement;
  private readonly selectedTypeElement: HTMLElement;
  private readonly selectedMassElement: HTMLElement;
  private readonly selectedRadiusElement: HTMLElement;
  private readonly selectedRenderRadiusElement: HTMLElement;
  private readonly selectedPositionElement: HTMLElement;
  private readonly selectedPhysicsElement: HTMLElement;
  private readonly selectedRotationElement: HTMLElement;
  private readonly focusBodyButton: HTMLButtonElement;
  private readonly closeInspectorButton: HTMLButtonElement;
  private readonly experiments: GuidedExperiments<OrbitalExperimentId>;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private animationFrame = 0;
  private lastTimestamp = performance.now();
  private lastMetricsUpdate = 0;
  private framesPerSecond = 60;
  private initialEnergy = 0;
  private activePresetId: string = getInitialPresetId();
  private currentTimeWarp: number = getPreset(this.activePresetId).defaultTimeWarp;
  private paused = false;
  private qualityMode: QualityMode = 'auto';
  private activeQuality: QualityLevel = 'balanced';
  private slowFrameTime = 0;
  private fastFrameTime = 0;
  private bodyCount = 0;
  private customBodySequence = 0;
  private vectorsVisible = false;
  private fieldVisible = false;
  private bodies: readonly BodyMetadata[] = [];
  private selectedBodyIndex: number | undefined;
  private lastCollisionSequence = 0;
  private collisionNoticeTimeout = 0;

  constructor(root: HTMLElement) {
    root.innerHTML = this.createMarkup();
    this.canvas = requireElement(root, '[data-canvas]');
    this.presetSelect = requireElement(root, '[data-preset]');
    this.speedSelect = requireElement(root, '[data-speed]');
    this.qualitySelect = requireElement(root, '[data-quality]');
    this.pauseButton = requireElement(root, '[data-pause]');
    this.resetButton = requireElement(root, '[data-reset]');
    this.addBodyButton = requireElement(root, '[data-add-body]');
    this.vectorsButton = requireElement(root, '[data-vectors]');
    this.fieldButton = requireElement(root, '[data-gravity-field]');
    this.systemViewButton = requireElement(root, '[data-system-view]');
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
    this.solverActiveElement = requireElement(root, '[data-solver-active]');
    this.collisionNotice = requireElement(root, '[data-collision-notice]');
    this.closeCollisionButton = requireElement(root, '[data-close-collision]');
    this.collisionTitle = requireElement(root, '[data-collision-title]');
    this.collisionDetail = requireElement(root, '[data-collision-detail]');
    this.bodyListElement = requireElement(root, '[data-body-list]');
    this.inspectorElement = requireElement(root, '[data-inspector]');
    this.selectedNameElement = requireElement(root, '[data-selected-name]');
    this.selectedTypeElement = requireElement(root, '[data-selected-type]');
    this.selectedMassElement = requireElement(root, '[data-selected-mass]');
    this.selectedRadiusElement = requireElement(root, '[data-selected-radius]');
    this.selectedRenderRadiusElement = requireElement(root, '[data-selected-render-radius]');
    this.selectedPositionElement = requireElement(root, '[data-selected-position]');
    this.selectedPhysicsElement = requireElement(root, '[data-selected-physics]');
    this.selectedRotationElement = requireElement(root, '[data-selected-rotation]');
    this.focusBodyButton = requireElement(root, '[data-focus-body]');
    this.closeInspectorButton = requireElement(root, '[data-close-inspector]');

    this.renderer = new OrbitalRenderer(this.canvas, (selection) => {
      this.handleBodySelection(selection);
    });
    this.worker = new SimulationWorkerClient({
      onInitialized: (details, frame) => this.handleInitialized(details, frame),
      onFrame: (frame) => this.handleFrame(frame),
      onError: (message) => this.setStatus(message, 'error'),
    });
    this.experiments = new GuidedExperiments(
      requireElement(root, '.viewport'),
      ORBITAL_EXPERIMENTS,
      (id) => this.applyExperiment(id),
    );

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
    this.experiments.activate(this.activePresetId as OrbitalExperimentId, false);
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    window.clearTimeout(this.collisionNoticeTimeout);
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
    this.bodies = details.bodies;
    this.selectedBodyIndex = undefined;
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
    this.speedSelect.value = String(this.currentTimeWarp);
    this.worker.setTimeScale(this.currentTimeWarp);
    this.renderBodyList();
    this.updateMetrics(frame, true);
    this.updateCollisionNotice(frame.collision);
    this.setStatus(this.paused ? 'Paused' : 'Running', this.paused ? 'paused' : 'running');
  }

  private handleFrame(frame: SimulationFrame): void {
    this.renderer.update(frame.positions, frame.time);
    this.updateSelectedPosition(frame.positions);
    this.updateMetrics(frame);
    this.updateCollisionNotice(frame.collision);

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

    this.timeElement.textContent = formatDuration(
      modelTimeToPhysicalSeconds(
        frame.time,
        getPreset(this.activePresetId).secondsPerTimeUnit,
      ),
    );
    this.fpsElement.textContent = formatNumber(this.framesPerSecond, 0);
    this.energyDriftElement.textContent = `${energyDrift.toExponential(1)}%`;
    this.momentumElement.textContent = momentum.toExponential(2);
    this.solverActiveElement.textContent =
      frame.gravityAlgorithm === 'barnes-hut' ? 'Barnes–Hut' : 'direct';
    this.lastMetricsUpdate = now;
  }

  private updateCollisionNotice(collision: CollisionEvent | undefined): void {
    if (collision === undefined || collision.sequence <= this.lastCollisionSequence) {
      return;
    }

    this.lastCollisionSequence = collision.sequence;
    this.renderer.showCollision(collision);
    let title: string;
    let detail: string;

    if (collision.visualClass === 'tidal-disruption') {
      title = 'Tidal disruption';
      detail =
        'The star is stretched along the tidal gradient. The visible stream separates into bound and escaping material before the resolved mass crosses the capture radius.';
    } else if (collision.visualClass === 'horizon-capture') {
      title = 'Horizon capture';
      detail =
        'The infalling body is stretched into a fading tidal stream. Its resolved mass and momentum join the black hole only after contact with the scaled capture radius.';
    } else if (collision.visualClass === 'compact-merger') {
      title =
        collision.outcome === 'black-hole-merger' ? 'Black hole merger' : 'Compact merger';
      detail =
        collision.outcome === 'black-hole-merger'
          ? `${collision.radiatedMass.toExponential(2)} mass units leave as gravitational radiation. No false luminous explosion is drawn for a vacuum binary.`
          : 'The hot outflow is a reduced-order matter proxy; the final compact object depends on masses and an equation of state not solved in real time.';
    } else if (collision.visualClass === 'stellar-merger') {
      title = collision.outcome === 'disruption' ? 'Stellar disruption' : 'Stellar merger';
      detail =
        'A rotating, expanded remnant sits inside an equatorial shock outflow. The flow communicates the luminous-red-nova regime without claiming to replace stellar hydrodynamics.';
    } else if (collision.outcome === 'hit-and-run') {
      title = 'Hit and run';
      detail = 'A fast grazing impact transferred momentum, but both major bodies survived.';
    } else if (collision.outcome === 'disruption') {
      title = 'Catastrophic disruption threshold';
      detail =
        'Impact energy crossed the gravity-regime threshold. The shock curtain marks unresolved melt, vapor, and dust; invented spherical fragments are intentionally omitted.';
    } else {
      title = 'Post-impact remnant';
      detail =
        'Mass and momentum form one heated body. The core keeps a volume-equivalent radius while a separate cooling curtain carries the unresolved ejecta.';
    }
    this.collisionTitle.textContent = title;
    this.collisionDetail.textContent = detail;
    this.collisionNotice.dataset.open = 'true';
    window.clearTimeout(this.collisionNoticeTimeout);
    this.collisionNoticeTimeout = window.setTimeout(() => {
      this.collisionNotice.dataset.open = 'false';
    }, 6_500);
  }

  private bindControls(): void {
    this.presetSelect.addEventListener('change', () => {
      this.activePresetId = this.presetSelect.value;
      this.currentTimeWarp = getPreset(this.activePresetId).defaultTimeWarp;
      this.experiments.activate(this.activePresetId as OrbitalExperimentId, false);
      this.setStatus('Loading model', 'loading');
      this.resetCollisionNotice();
      this.worker.initialize(this.activePresetId);
    });

    this.pauseButton.addEventListener('click', () => this.togglePaused());

    this.resetButton.addEventListener('click', () => {
      this.setStatus('Resetting model', 'loading');
      this.resetCollisionNotice();
      this.worker.initialize(this.activePresetId);
    });

    this.closeCollisionButton.addEventListener('click', () => {
      window.clearTimeout(this.collisionNoticeTimeout);
      this.collisionNotice.dataset.open = 'false';
    });

    this.addBodyButton.addEventListener('click', () => {
      this.experiments.setFreeMode();
      const nameInput = requireElement<HTMLInputElement>(this.bodyForm, '[name="name"]');
      nameInput.value = `Body ${this.bodyCount + 1}`;
      this.bodyFormError.textContent = '';
      this.bodyDialog.showModal();
      nameInput.focus();
      nameInput.select();
    });

    this.vectorsButton.addEventListener('click', () => {
      this.vectorsVisible = !this.vectorsVisible;
      this.vectorsButton.setAttribute('aria-pressed', String(this.vectorsVisible));
      this.renderer.setVelocityVectorsVisible(this.vectorsVisible);
    });

    this.fieldButton.addEventListener('click', () => {
      this.fieldVisible = !this.fieldVisible;
      this.fieldButton.setAttribute('aria-pressed', String(this.fieldVisible));
      this.renderer.setGravityFieldVisible(this.fieldVisible);
    });

    this.systemViewButton.addEventListener('click', () => {
      this.renderer.focusSystem();
    });

    this.focusBodyButton.addEventListener('click', () => {
      if (this.selectedBodyIndex !== undefined) {
        this.renderer.focusBody(this.selectedBodyIndex);
      }
    });

    this.closeInspectorButton.addEventListener('click', () => {
      this.renderer.selectBody(undefined);
    });

    this.bodyForm.addEventListener('submit', (event) => {
      event.preventDefault();

      if (!this.bodyForm.reportValidity()) {
        return;
      }

      const values = new FormData(this.bodyForm);
      const readNumber = (name: string): number => Number(values.get(name));
      const name = String(values.get('name') ?? '').trim();
      const requestedKind = String(values.get('kind') ?? 'rocky');
      const kind = (
        requestedKind === 'quasar' || requestedKind === 'accreting-black-hole'
          ? 'black-hole'
          : requestedKind
      ) as BodyMetadata['kind'];
      const mass = readNumber('mass');
      const radius = readNumber('radius');
      const renderRadius = readNumber('render-radius');
      const positionX = readNumber('position-x');
      const positionY = readNumber('position-y');
      const velocityX = readNumber('velocity-x');
      const velocityY = readNumber('velocity-y');
      const color = String(values.get('color') ?? '#79d9ff');
      const numericValues = [
        mass,
        radius,
        renderRadius,
        positionX,
        positionY,
        velocityX,
        velocityY,
      ];

      if (!name || numericValues.some((value) => !Number.isFinite(value))) {
        this.bodyFormError.textContent = 'Enter a name and finite numeric values.';
        return;
      }

      this.customBodySequence += 1;
      this.worker.addBody({
        id: `custom-${this.customBodySequence}`,
        name,
        kind,
        surface:
          requestedKind === 'quasar'
            ? 'quasar'
            : requestedKind === 'accreting-black-hole'
              ? 'accretion-disk'
              : kind === 'star'
                ? 'sun'
                : kind === 'black-hole'
                  ? 'none'
                  : kind === 'pulsar'
                    ? 'pulsar'
                    : kind === 'neutron-star'
                      ? 'neutron-star'
                      : 'procedural',
        mass,
        radius,
        renderRadius,
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
      this.currentTimeWarp = Number(this.speedSelect.value);
      this.worker.setTimeScale(this.currentTimeWarp);
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

      if (event.code === 'Escape' && !this.bodyDialog.open) {
        this.renderer.selectBody(undefined);
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

  private applyExperiment(id: OrbitalExperimentId): void {
    this.activePresetId = id;
    this.currentTimeWarp = getPreset(id).defaultTimeWarp;
    this.presetSelect.value = id;
    this.setStatus('Loading experiment', 'loading');
    this.resetCollisionNotice();
    this.worker.initialize(id);
  }

  private resetCollisionNotice(): void {
    window.clearTimeout(this.collisionNoticeTimeout);
    this.lastCollisionSequence = 0;
    this.collisionNotice.dataset.open = 'false';
    this.renderer.clearCollisionVisual();
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

  private handleBodySelection(selection: BodySelection | undefined): void {
    this.selectedBodyIndex = selection?.index;
    const isOpen = selection !== undefined;
    this.inspectorElement.dataset.open = String(isOpen);
    this.inspectorElement.setAttribute('aria-hidden', String(!isOpen));

    if (selection !== undefined) {
      this.collisionNotice.dataset.open = 'false';
      this.selectedNameElement.textContent = selection.body.name;
      this.selectedTypeElement.textContent = selection.body.kind.replaceAll('-', ' ');
      this.selectedMassElement.textContent =
        selection.body.mass >= 0.001
          ? `${formatNumber(selection.body.mass, 6)} model units`
          : `${selection.body.mass.toExponential(4)} model units`;
      this.selectedRadiusElement.textContent = formatMeasurement(selection.body.radius);
      this.selectedRenderRadiusElement.textContent = formatNumber(
        selection.body.renderRadius,
        4,
      );
      this.selectedPositionElement.textContent = 'Updating…';
      const rotationPeriod =
        selection.body.rotationRate === 0
          ? 'Not specified'
          : `${selection.body.rotationRate < 0 ? 'Retrograde · ' : ''}${formatDuration(
              (Math.PI * 2 * getPreset(this.activePresetId).secondsPerTimeUnit) /
                Math.abs(selection.body.rotationRate),
            )}`;
      this.selectedRotationElement.textContent = rotationPeriod;
      this.selectedPhysicsElement.textContent =
        selection.body.surface === 'impact-remnant'
          ? 'A volume-equivalent post-impact core: mass and linear momentum are conserved. Its oblate, fractured surface and cooling ejecta curtain are reduced-order thermal visuals; composition and fluid flow require SPH or hydrodynamics.'
          : selection.body.surface === 'stellar-merger'
            ? 'An expanded stellar-merger envelope with a turbulent photosphere and equatorial outflow. Gravity conserves resolved mass and momentum; internal mixing, radiative transfer and dust formation require stellar hydrodynamics.'
          : selection.body.id === 'tidally-stretched-star'
            ? 'The shape follows the black hole’s tidal gradient. Stretching rises as inverse distance cubed; near a stress ratio of one, the leading tidal acceleration across the star matches its surface self-gravity. Fluid breakup is not simulated.'
          : selection.body.surface === 'quasar'
            ? 'Active Schwarzschild object: null geodesics form a 2.598 rₛ shadow and show the rear face of the thin disk above and below it. The disk begins at the 3 rₛ ISCO. Jets are qualitative emission cones; all bodies still share the gravity solver.'
            : selection.body.surface === 'accretion-disk'
              ? 'Accreting Schwarzschild black hole: the event horizon is at rₛ, the unstable photon sphere at 1.5 rₛ, and the critical shadow radius is 3√3/2 rₛ ≈ 2.598 rₛ. Rays and both disk intersections come from precomputed null geodesics; the thin disk starts at the 3 rₛ ISCO.'
              : selection.body.kind === 'black-hole'
                ? 'Naked Schwarzschild black hole: no emitting disk is assumed. The horizon is at rₛ, photons can orbit only unstably at 1.5 rₛ, and bent background light outlines the critical 3√3/2 rₛ ≈ 2.598 rₛ shadow.'
            : selection.body.kind === 'pulsar'
              ? 'A rotating neutron star. The cones mark an idealized magnetic-axis lighthouse beam; the object itself has mass and participates in every N-body interaction.'
              : selection.body.kind === 'neutron-star'
                ? 'A compact stellar remnant shown at an enlarged visual radius. Its mass and physical radius—not the glow—set dynamics and contact.'
                : 'Rendered size is enlarged for readability; gravity and collisions use the physical radius and mass.';
    }

    this.bodyListElement
      .querySelectorAll<HTMLButtonElement>('[data-body-index]')
      .forEach((button) => {
        const selected = Number(button.dataset.bodyIndex) === selection?.index;
        button.dataset.selected = String(selected);
        button.setAttribute('aria-pressed', String(selected));
      });
  }

  private updateSelectedPosition(positions: Float32Array): void {
    if (this.selectedBodyIndex === undefined) {
      return;
    }

    const offset = this.selectedBodyIndex * 3;
    if (positions.length < offset + 3) {
      return;
    }

    const x = formatNumber(positions[offset] ?? 0, 3);
    const y = formatNumber(positions[offset + 1] ?? 0, 3);
    const z = formatNumber(positions[offset + 2] ?? 0, 3);
    this.selectedPositionElement.textContent = `${x}, ${y}, ${z}`;
  }

  private renderBodyList(): void {
    this.bodyListElement.replaceChildren(
      ...this.bodies.map((body, bodyIndex) => {
        const button = document.createElement('button');
        const swatch = document.createElement('span');
        const label = document.createElement('span');
        button.type = 'button';
        button.className = 'body-chip';
        button.dataset.bodyIndex = String(bodyIndex);
        button.dataset.selected = 'false';
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', `Select and follow ${body.name}`);
        swatch.className = 'body-swatch';
        swatch.style.setProperty('--body-color', body.color);
        label.textContent = body.name;
        button.append(swatch, label);
        button.addEventListener('click', () => this.renderer.focusBody(bodyIndex));
        return button;
      }),
    );
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
          <div class="brand" aria-label="Cosmic Sandbox">
            <span class="brand-mark" aria-hidden="true">
              <span></span>
            </span>
            <span>Cosmic Sandbox</span>
            <a class="lab-index-link" href="?lab=catalog">All labs</a>
          </div>
          <label class="system-picker">
            <span>System</span>
            <select data-preset aria-label="Orbital system"></select>
          </label>
          <div class="status" data-status data-state="loading" role="status">Loading model</div>
        </header>

        <section class="viewport" aria-label="Interactive cosmic simulation">
          <canvas data-canvas aria-label="Three-dimensional view of orbiting bodies"></canvas>

          <div class="scene-heading">
            <p class="eyebrow">Live gravitational system</p>
            <h1 data-title>Idealized solar system</h1>
            <p data-summary>Loading orbital model…</p>
          </div>

          <nav class="tool-rail" aria-label="Scene tools">
            <button class="tool-button" type="button" data-add-body>
              <span aria-hidden="true">＋</span>
              <small>Add</small>
            </button>
            <button class="tool-button" type="button" data-vectors aria-pressed="false">
              <span aria-hidden="true">↗</span>
              <small>Vectors</small>
            </button>
            <button class="tool-button" type="button" data-gravity-field aria-pressed="false">
              <span aria-hidden="true">⌁</span>
              <small>Field</small>
            </button>
            <button class="tool-button" type="button" data-system-view>
              <span aria-hidden="true">◎</span>
              <small>System</small>
            </button>
          </nav>

          <aside class="metrics" aria-label="Live physical diagnostics">
            <div class="metric metric-primary">
              <span>Physical elapsed time</span>
              <strong data-time>0.0 s</strong>
            </div>
            <div class="metric-strip">
              <div class="metric">
                <span>FPS</span>
                <strong data-fps>—</strong>
              </div>
              <div class="metric">
                <span>Bodies</span>
                <strong data-body-count>—</strong>
              </div>
              <div class="metric">
                <span>Energy Δ</span>
                <strong data-energy-drift>—</strong>
              </div>
              <div class="metric">
                <span>Momentum</span>
                <strong data-momentum>—</strong>
              </div>
            </div>
            <p class="quality-note">Render <span data-quality-active>balanced</span> · Physics <span data-solver-active>direct</span></p>
          </aside>

          <aside class="collision-notice" data-collision-notice data-open="false" aria-live="polite">
            <span class="collision-icon" aria-hidden="true">✦</span>
            <div>
              <p class="eyebrow">Physical event</p>
              <strong data-collision-title>Collision</strong>
              <p data-collision-detail></p>
            </div>
            <button class="collision-close" type="button" data-close-collision aria-label="Dismiss physical event">×</button>
          </aside>

          <aside class="object-inspector" data-inspector data-open="false" aria-hidden="true">
            <header>
              <div>
                <p class="eyebrow">Selected object</p>
                <h2 data-selected-name>Object</h2>
              </div>
              <button class="inspector-close" type="button" data-close-inspector aria-label="Close object inspector">×</button>
            </header>
            <dl>
              <div>
                <dt>Object type</dt>
                <dd data-selected-type>—</dd>
              </div>
              <div>
                <dt>Relative mass</dt>
                <dd data-selected-mass>—</dd>
              </div>
              <div>
                <dt>Physical radius</dt>
                <dd data-selected-radius>—</dd>
              </div>
              <div>
                <dt>Visual radius</dt>
                <dd data-selected-render-radius>—</dd>
              </div>
              <div>
                <dt>Position x, y, z</dt>
                <dd data-selected-position>—</dd>
              </div>
              <div>
                <dt>Sidereal rotation</dt>
                <dd data-selected-rotation>—</dd>
              </div>
            </dl>
            <p class="inspector-physics" data-selected-physics></p>
            <button class="button button-primary inspector-action" type="button" data-focus-body>
              Follow object
            </button>
          </aside>

          <div class="hint" aria-hidden="true">Drag to orbit · Scroll to zoom · Click an object to inspect</div>

          <nav class="body-ribbon" data-body-list aria-label="Celestial objects"></nav>

          <div class="control-dock" aria-label="Simulation controls">
            <div class="transport">
              <button class="button button-primary" type="button" data-pause aria-pressed="false">
                Pause
              </button>
              <button class="button" type="button" data-reset>Reset</button>
            </div>

            <label class="field">
              <span>Speed</span>
              <select data-speed aria-label="Simulation speed">
                <option value="1">Real time · 1×</option>
                <option value="60">1 min/s · 60×</option>
                <option value="1000">1,000×</option>
                <option value="3600">1 h/s · 3,600×</option>
                <option value="86400">1 day/s · 86,400×</option>
                <option value="1000000" selected>11.6 days/s · 10⁶×</option>
                <option value="10000000">115.7 days/s · 10⁷×</option>
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

            <span class="key-hint">Space</span>
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
            <label class="form-field form-field-wide">
              <span>Object type</span>
              <select name="kind" required>
                <option value="rocky" selected>Rocky body</option>
                <option value="terrestrial">Terrestrial planet</option>
                <option value="gas-giant">Gas giant</option>
                <option value="ice-giant">Ice giant</option>
                <option value="star">Star</option>
                <option value="black-hole">Black hole</option>
                <option value="accreting-black-hole">Black hole · accretion disk</option>
                <option value="quasar">Active black hole · quasar</option>
                <option value="neutron-star">Neutron star</option>
                <option value="pulsar">Pulsar</option>
              </select>
            </label>
            <label class="form-field">
              <span>Mass</span>
              <input name="mass" type="number" value="0.001" min="0.000000001" max="100" step="any" required />
            </label>
            <label class="form-field">
              <span>Physical radius</span>
              <input name="radius" type="number" value="0.02" min="0.000001" max="1" step="any" required />
            </label>
            <label class="form-field form-field-wide">
              <span>Visual radius</span>
              <input name="render-radius" type="number" value="0.07" min="0.005" max="1" step="any" required />
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
