import './particle-lab.css';

import {
  GuidedExperiments,
  type GuidedExperiment,
} from '../../core/guided-experiments';
import {
  chargedParticles,
  createTrack,
  getParticle,
  type ParticleId,
} from './model/charged-particle';
import { ParticleTrackRenderer } from './renderer/particle-track-renderer';

type ParticleExperimentId =
  | 'read-track'
  | 'negative-charge'
  | 'positive-charge'
  | 'high-momentum'
  | 'pion-decay';

interface ParticleExperiment extends GuidedExperiment<ParticleExperimentId> {
  readonly particle: ParticleId;
  readonly energyGeV: number;
  readonly fieldTesla: number;
}

const PARTICLE_EXPERIMENTS: readonly ParticleExperiment[] = [
  {
    id: 'read-track',
    label: 'Read a track',
    title: 'Turn curvature into momentum',
    question: 'What can a detector infer from one curved trajectory?',
    observation: 'Known charge and field turn the measured radius into transverse momentum.',
    particle: 'muon-minus',
    energyGeV: 0.75,
    fieldTesla: 2,
  },
  {
    id: 'negative-charge',
    label: 'Electron',
    title: 'A negative charge bends one way',
    question: 'Which way does an electron curve when B points out of the screen?',
    observation: 'Record the bend direction, then load the Positron experiment.',
    particle: 'electron',
    energyGeV: 1,
    fieldTesla: 2,
  },
  {
    id: 'positive-charge',
    label: 'Positron',
    title: 'Reverse charge, reverse curvature',
    question: 'What changes if mass and energy stay fixed but charge changes sign?',
    observation: 'The radius stays equal while the trajectory mirrors across the launch axis.',
    particle: 'positron',
    energyGeV: 1,
    fieldTesla: 2,
  },
  {
    id: 'high-momentum',
    label: 'High momentum',
    title: 'A faster particle bends less',
    question: 'Why does a high-momentum track look straighter in the same field?',
    observation: 'Radius grows in direct proportion to momentum: R = p/(0.299792458|q|B).',
    particle: 'muon-minus',
    energyGeV: 5,
    fieldTesla: 2,
  },
  {
    id: 'pion-decay',
    label: 'Pion survival',
    title: 'Watch an unstable track fade',
    question: 'How far does a slow charged pion travel on average before decay?',
    observation: 'Opacity follows exp(−s/L); no random decay products are invented.',
    particle: 'pion-plus',
    energyGeV: 0.02,
    fieldTesla: 0.4,
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

const formatMetric = (value: number, digits = 3): string =>
  new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value);

export class ParticleLab {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: ParticleTrackRenderer;
  private readonly particleSelect: HTMLSelectElement;
  private readonly energyInput: HTMLInputElement;
  private readonly fieldInput: HTMLInputElement;
  private readonly playButton: HTMLButtonElement;
  private readonly particleName: HTMLElement;
  private readonly particleSymbol: HTMLElement;
  private readonly particleDescription: HTMLElement;
  private readonly energyValue: HTMLElement;
  private readonly fieldValue: HTMLElement;
  private readonly massValue: HTMLElement;
  private readonly momentumValue: HTMLElement;
  private readonly betaValue: HTMLElement;
  private readonly radiusValue: HTMLElement;
  private readonly decayValue: HTMLElement;
  private readonly chargeValue: HTMLElement;
  private readonly experiments: GuidedExperiments<ParticleExperimentId>;
  private animationFrame = 0;
  private particleId: ParticleId = 'muon-minus';
  private playing = true;

  constructor(root: HTMLElement) {
    root.innerHTML = this.createMarkup();
    this.canvas = requireElement(root, '[data-particle-canvas]');
    this.particleSelect = requireElement(root, '[data-particle-select]');
    this.energyInput = requireElement(root, '[data-particle-energy]');
    this.fieldInput = requireElement(root, '[data-particle-field]');
    this.playButton = requireElement(root, '[data-particle-play]');
    this.particleName = requireElement(root, '[data-particle-name]');
    this.particleSymbol = requireElement(root, '[data-particle-symbol]');
    this.particleDescription = requireElement(root, '[data-particle-description]');
    this.energyValue = requireElement(root, '[data-energy-value]');
    this.fieldValue = requireElement(root, '[data-field-value]');
    this.massValue = requireElement(root, '[data-particle-mass]');
    this.momentumValue = requireElement(root, '[data-particle-momentum]');
    this.betaValue = requireElement(root, '[data-particle-beta]');
    this.radiusValue = requireElement(root, '[data-particle-radius]');
    this.decayValue = requireElement(root, '[data-particle-decay]');
    this.chargeValue = requireElement(root, '[data-particle-charge]');
    this.renderer = new ParticleTrackRenderer(this.canvas);
    this.populateParticles();
    this.experiments = new GuidedExperiments(
      requireElement(root, '.particle-viewport'),
      PARTICLE_EXPERIMENTS,
      (id) => this.applyExperiment(id),
    );
    this.bindControls();
  }

  start(): void {
    this.updateTrack();
    this.experiments.activate('read-track', false);
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

  private populateParticles(): void {
    this.particleSelect.replaceChildren(
      ...chargedParticles.map((particle) => {
        const option = document.createElement('option');
        option.value = particle.id;
        option.textContent = `${particle.symbol} · ${particle.name}`;
        return option;
      }),
    );
    this.particleSelect.value = this.particleId;
  }

  private bindControls(): void {
    this.particleSelect.addEventListener('change', () => {
      this.particleId = this.particleSelect.value as ParticleId;
      this.experiments.setFreeMode();
      this.updateTrack();
    });
    this.energyInput.addEventListener('input', () => {
      this.experiments.setFreeMode();
      this.updateTrack();
    });
    this.fieldInput.addEventListener('input', () => {
      this.experiments.setFreeMode();
      this.updateTrack();
    });
    this.playButton.addEventListener('click', () => {
      this.playing = !this.playing;
      this.renderer.setPlaying(this.playing);
      this.playButton.setAttribute('aria-pressed', String(!this.playing));
      this.playButton.textContent = this.playing ? 'Pause trace' : 'Resume trace';
    });
  }

  private applyExperiment(id: ParticleExperimentId): void {
    const experiment = PARTICLE_EXPERIMENTS.find((candidate) => candidate.id === id);
    if (experiment === undefined) {
      return;
    }
    this.particleId = experiment.particle;
    this.particleSelect.value = experiment.particle;
    this.energyInput.value = String(experiment.energyGeV);
    this.fieldInput.value = String(experiment.fieldTesla);
    this.updateTrack();
  }

  private updateTrack(): void {
    const particle = getParticle(this.particleId);
    const kineticEnergy = Number(this.energyInput.value);
    const magneticField = Number(this.fieldInput.value);
    const track = createTrack(particle, kineticEnergy, magneticField, 12);
    this.renderer.setTrack(track);

    const fieldDirection =
      magneticField > 0 ? 'out of screen' : magneticField < 0 ? 'into screen' : 'off';
    this.particleName.textContent = particle.name;
    this.particleSymbol.textContent = particle.symbol;
    this.particleDescription.textContent = `${particle.symbol} in an ideal uniform magnetic field and vacuum.`;
    this.energyValue.textContent = `${formatMetric(kineticEnergy, 2)} GeV`;
    this.fieldValue.textContent = `${magneticField.toFixed(1)} T · ${fieldDirection}`;
    this.massValue.textContent = `${formatMetric(particle.massGeV * 1_000, 6)} MeV/c²`;
    this.momentumValue.textContent = `${formatMetric(track.kinematics.momentum, 4)} GeV/c`;
    this.betaValue.textContent = formatMetric(track.kinematics.beta, 6);
    this.radiusValue.textContent = Number.isFinite(track.kinematics.radius)
      ? `${formatMetric(track.kinematics.radius, 4)} m`
      : '∞ · straight';
    this.decayValue.textContent = Number.isFinite(track.kinematics.meanDecayLength)
      ? `${formatMetric(track.kinematics.meanDecayLength, 3)} m`
      : 'Stable in model';
    this.chargeValue.textContent = particle.charge > 0 ? '+1 e' : '−1 e';
  }

  private createMarkup(): string {
    return `
      <article class="particle-shell">
        <header class="particle-topbar">
          <div class="particle-brand">
            <span class="particle-mark" aria-hidden="true"><i></i><i></i><i></i></span>
            <span>Particle Track Lab</span>
            <a href="?lab=catalog">All labs</a>
          </div>
          <label class="particle-picker">
            <span>Particle</span>
            <select data-particle-select aria-label="Charged particle"></select>
          </label>
          <div class="particle-status"><span></span>Relativistic track</div>
        </header>

        <section class="particle-viewport" aria-label="Charged particle detector track">
          <canvas data-particle-canvas aria-label="Ideal charged-particle trajectory in a magnetic field"></canvas>

          <div class="particle-heading">
            <p class="particle-eyebrow">Uniform solenoidal field · transverse view</p>
            <div class="particle-title-row">
              <span data-particle-symbol>μ⁻</span>
              <h1 data-particle-name>Muon</h1>
            </div>
            <p data-particle-description>Muon in an ideal uniform magnetic field and vacuum.</p>
            <p class="particle-model-note">
              Curvature follows p = 0.299792458 |z|BR. Matter effects and detector noise are off.
            </p>
          </div>

          <aside class="track-panel" aria-label="Relativistic track properties">
            <p class="particle-eyebrow">Computed state</p>
            <dl>
              <div><dt>Rest mass</dt><dd data-particle-mass>—</dd></div>
              <div><dt>Charge</dt><dd data-particle-charge>—</dd></div>
              <div><dt>Momentum</dt><dd data-particle-momentum>—</dd></div>
              <div><dt>Speed β = v/c</dt><dd data-particle-beta>—</dd></div>
              <div><dt>Curvature radius</dt><dd data-particle-radius>—</dd></div>
              <div><dt>Mean decay length</dt><dd data-particle-decay>—</dd></div>
            </dl>
          </aside>

          <div class="field-legend" aria-label="Magnetic field convention">
            <span>⊙ field out of screen</span><span>⊗ field into screen</span>
          </div>

          <div class="particle-dock" aria-label="Particle track controls">
            <label class="particle-control">
              <span>Kinetic energy <strong data-energy-value>0.75 GeV</strong></span>
              <input data-particle-energy type="range" min="0.01" max="5" value="0.75" step="0.01" />
            </label>
            <label class="particle-control">
              <span>Magnetic field <strong data-field-value>2.0 T</strong></span>
              <input data-particle-field type="range" min="-4" max="4" value="2" step="0.1" />
            </label>
            <button type="button" data-particle-play aria-pressed="false">Pause trace</button>
          </div>
        </section>
      </article>
    `;
  }
}
