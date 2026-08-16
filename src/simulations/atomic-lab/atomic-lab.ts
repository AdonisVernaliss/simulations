import './atomic-lab.css';

import {
  GuidedExperiments,
  type GuidedExperiment,
} from '../../core/guided-experiments';
import {
  BOHR_RADIUS_METRES,
  getHydrogenEnergy,
  getHydrogenState,
  hydrogenStates,
  type HydrogenStateId,
} from './model/hydrogen';
import { AtomicRenderer, type AtomicQuality } from './renderer/atomic-renderer';

type AtomicExperimentId = 'probability' | 'ground' | 'radial-node' | 'angular-node';

interface AtomicExperiment extends GuidedExperiment<AtomicExperimentId> {
  readonly state: HydrogenStateId;
}

const ATOMIC_EXPERIMENTS: readonly AtomicExperiment[] = [
  {
    id: 'probability',
    label: 'Probability, not orbit',
    title: 'Read a quantum probability cloud',
    question: 'Where is an electron likely to be detected in a 2p state?',
    observation: 'Point density follows |ψ|²; the empty equatorial plane is an angular node.',
    state: '2p-z',
  },
  {
    id: 'ground',
    label: 'Ground state',
    title: 'The simplest bound state',
    question: 'Why is the 1s cloud spherical and node-free?',
    observation: 'With l = 0, probability depends only on distance from the nucleus.',
    state: '1s',
  },
  {
    id: 'radial-node',
    label: 'Radial node',
    title: 'Find a forbidden spherical shell',
    question: 'Can probability vanish at one radius without a physical barrier?',
    observation: 'The 2s wavefunction changes sign at r = 2a₀, leaving a spherical node.',
    state: '2s',
  },
  {
    id: 'angular-node',
    label: 'Angular nodes',
    title: 'Let angular momentum shape the cloud',
    question: 'How does l = 2 differ from a p orbital?',
    observation: 'The 3d z² state has two conical nodes fixed by its angular wavefunction.',
    state: '3d-z2',
  },
] as const;

const requireElement = <ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType => {
  const element = root.querySelector<ElementType>(selector);
  if (element === null) {
    throw new Error(`Required interface element is missing: ${selector}`);
  }
  return element;
};

export class AtomicLab {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: AtomicRenderer;
  private readonly stateSelect: HTMLSelectElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly phaseButton: HTMLButtonElement;
  private readonly rotationButton: HTMLButtonElement;
  private readonly stateName: HTMLElement;
  private readonly stateDescription: HTMLElement;
  private readonly principalNumber: HTMLElement;
  private readonly angularNumber: HTMLElement;
  private readonly magneticNumber: HTMLElement;
  private readonly energy: HTMLElement;
  private readonly nodeCount: HTMLElement;
  private readonly experiments: GuidedExperiments<AtomicExperimentId>;
  private animationFrame = 0;
  private phaseVisible = true;
  private rotating = true;
  private stateId: HydrogenStateId = '2p-z';

  constructor(root: HTMLElement) {
    root.innerHTML = this.createMarkup();
    this.canvas = requireElement(root, '[data-atomic-canvas]');
    this.stateSelect = requireElement(root, '[data-atomic-state]');
    this.qualitySelect = requireElement(root, '[data-atomic-quality]');
    this.phaseButton = requireElement(root, '[data-atomic-phase]');
    this.rotationButton = requireElement(root, '[data-atomic-rotation]');
    this.stateName = requireElement(root, '[data-state-name]');
    this.stateDescription = requireElement(root, '[data-state-description]');
    this.principalNumber = requireElement(root, '[data-quantum-n]');
    this.angularNumber = requireElement(root, '[data-quantum-l]');
    this.magneticNumber = requireElement(root, '[data-quantum-m]');
    this.energy = requireElement(root, '[data-state-energy]');
    this.nodeCount = requireElement(root, '[data-node-count]');
    this.renderer = new AtomicRenderer(this.canvas);

    this.populateStates();
    this.experiments = new GuidedExperiments(
      requireElement(root, '.atomic-viewport'),
      ATOMIC_EXPERIMENTS,
      (id) => this.applyExperiment(id),
    );
    this.bindControls();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.rotating = false;
      this.rotationButton.setAttribute('aria-pressed', 'false');
      this.rotationButton.textContent = 'Rotation off';
      this.qualitySelect.value = 'low';
      this.renderer.setRotating(false);
      this.renderer.setQuality('low');
    }
  }

  start(): void {
    this.applyState();
    this.experiments.activate('probability', false);
    this.experiments.open();
    this.animationFrame = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.renderer.destroy();
  }

  private readonly tick = (timestamp: number): void => {
    this.renderer.render(timestamp);
    this.animationFrame = requestAnimationFrame(this.tick);
  };

  private populateStates(): void {
    this.stateSelect.replaceChildren(
      ...hydrogenStates.map((state) => {
        const option = document.createElement('option');
        option.value = state.id;
        option.textContent = `${state.label} · n=${state.n}, l=${state.l}, m=${state.m}`;
        return option;
      }),
    );
    this.stateSelect.value = this.stateId;
  }

  private bindControls(): void {
    this.stateSelect.addEventListener('change', () => {
      this.stateId = this.stateSelect.value as HydrogenStateId;
      this.experiments.setFreeMode();
      this.applyState();
    });

    this.qualitySelect.addEventListener('change', () => {
      this.renderer.setQuality(this.qualitySelect.value as AtomicQuality);
    });

    this.phaseButton.addEventListener('click', () => {
      this.phaseVisible = !this.phaseVisible;
      this.phaseButton.setAttribute('aria-pressed', String(this.phaseVisible));
      this.phaseButton.textContent = this.phaseVisible ? 'Phase colors on' : 'Phase colors off';
      this.renderer.setPhaseVisible(this.phaseVisible);
    });

    this.rotationButton.addEventListener('click', () => {
      this.rotating = !this.rotating;
      this.rotationButton.setAttribute('aria-pressed', String(this.rotating));
      this.rotationButton.textContent = this.rotating ? 'Rotation on' : 'Rotation off';
      this.renderer.setRotating(this.rotating);
    });
  }

  private applyExperiment(id: AtomicExperimentId): void {
    const experiment = ATOMIC_EXPERIMENTS.find((candidate) => candidate.id === id);
    if (experiment === undefined) {
      return;
    }
    this.stateId = experiment.state;
    this.stateSelect.value = experiment.state;
    this.applyState();
  }

  private applyState(): void {
    const state = getHydrogenState(this.stateId);
    this.renderer.setState(state);
    this.renderer.setPhaseVisible(this.phaseVisible);
    this.stateName.textContent = `${state.label} orbital`;
    this.stateDescription.textContent = state.description;
    this.principalNumber.textContent = String(state.n);
    this.angularNumber.textContent = String(state.l);
    this.magneticNumber.textContent = String(state.m);
    this.energy.textContent = `${getHydrogenEnergy(state.n).toFixed(6)} eV`;
    this.nodeCount.textContent = `${state.radialNodes} radial · ${state.angularNodes} angular`;
  }

  private createMarkup(): string {
    return `
      <article class="atomic-shell">
        <header class="atomic-topbar">
          <div class="atomic-brand">
            <span class="atomic-mark" aria-hidden="true"><span></span><i></i></span>
            <span>Atomic Orbitals Lab</span>
            <a href="?lab=catalog">All labs</a>
          </div>
          <label class="atomic-state-picker">
            <span>Stationary state</span>
            <select data-atomic-state aria-label="Hydrogen orbital"></select>
          </label>
          <div class="atomic-status"><span></span>Analytic state</div>
        </header>

        <section class="atomic-viewport" aria-label="Hydrogen orbital probability density">
          <canvas data-atomic-canvas aria-label="Three-dimensional orbital probability cloud"></canvas>

          <div class="atomic-heading">
            <p class="atomic-eyebrow">Hydrogen · non-relativistic Coulomb model</p>
            <h1 data-state-name>2p z orbital</h1>
            <p data-state-description>Two-lobed state separated by the nodal xy plane.</p>
            <div class="atomic-truth-note">
              <span aria-hidden="true">ψ</span>
              <p>Points sample |ψ|². They are not electrons travelling on hidden paths.</p>
            </div>
          </div>

          <aside class="quantum-panel" aria-label="Quantum state properties">
            <p class="atomic-eyebrow">Quantum numbers</p>
            <div class="quantum-numbers">
              <div><span>n</span><strong data-quantum-n>2</strong></div>
              <div><span>l</span><strong data-quantum-l>1</strong></div>
              <div><span>m</span><strong data-quantum-m>0</strong></div>
            </div>
            <dl>
              <div><dt>Model energy</dt><dd data-state-energy>—</dd></div>
              <div><dt>Nodes</dt><dd data-node-count>—</dd></div>
              <div><dt>Length unit</dt><dd>1 a₀ = ${BOHR_RADIUS_METRES.toExponential(8)} m</dd></div>
              <div><dt>Nucleus</dt><dd>Marker not to scale</dd></div>
            </dl>
          </aside>

          <div class="phase-legend" aria-label="Wavefunction phase legend">
            <span><i class="phase-positive"></i>ψ ≥ 0</span>
            <span><i class="phase-negative"></i>ψ &lt; 0</span>
          </div>

          <p class="atomic-hint" aria-hidden="true">Drag to orbit · Scroll to zoom · Shells mark radial scale</p>

          <div class="atomic-dock" aria-label="Atomic visualization controls">
            <button type="button" data-atomic-phase aria-pressed="true">Phase colors on</button>
            <button type="button" data-atomic-rotation aria-pressed="true">Rotation on</button>
            <label>
              <span>Point density</span>
              <select data-atomic-quality>
                <option value="low">Low</option>
                <option value="balanced" selected>Balanced</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>
        </section>
      </article>
    `;
  }
}
