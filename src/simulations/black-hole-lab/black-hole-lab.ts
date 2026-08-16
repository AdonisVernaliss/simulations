import './black-hole-lab.css';

import {
  GuidedExperiments,
  type GuidedExperiment,
} from '../../core/guided-experiments';
import {
  CRITICAL_IMPACT_PARAMETER,
  getSchwarzschildRadius,
  type NullGeodesic,
} from './model/schwarzschild';
import { GeodesicRenderer } from './renderer/geodesic-renderer';

type BlackHoleExperimentId = 'strong-lensing' | 'capture' | 'near-critical' | 'weak-field' | 'scale';

interface BlackHoleExperiment extends GuidedExperiment<BlackHoleExperimentId> {
  readonly impactParameter: number;
  readonly massExponent: number;
}

const BLACK_HOLE_EXPERIMENTS: readonly BlackHoleExperiment[] = [
  {
    id: 'strong-lensing',
    label: 'Strong lensing',
    title: 'Bend light through curved spacetime',
    question: 'How can a photon escape yet turn through a large angle?',
    observation: 'At b = 3.2rₛ the ray passes outside the photon sphere and escapes strongly deflected.',
    impactParameter: 3.2,
    massExponent: 6.5,
  },
  {
    id: 'capture',
    label: 'Light capture',
    title: 'Cross the capture boundary',
    question: 'What happens below the critical impact parameter?',
    observation: 'The null geodesic crosses the event horizon; no outward path remains.',
    impactParameter: 2.4,
    massExponent: 6.5,
  },
  {
    id: 'near-critical',
    label: 'Photon sphere',
    title: 'Skim the unstable photon orbit',
    question: 'Why does a tiny impact change create a huge deflection?',
    observation: 'At b just above 2.598rₛ, the photon lingers near r = 1.5rₛ before escaping.',
    impactParameter: 2.62,
    massExponent: 6.5,
  },
  {
    id: 'weak-field',
    label: 'Weak lensing',
    title: 'Recover Einstein’s weak-field limit',
    question: 'How does bending change far from the horizon?',
    observation: 'At large b, the deflection approaches α ≈ 2rₛ/b.',
    impactParameter: 7,
    massExponent: 6.5,
  },
  {
    id: 'scale',
    label: 'Change mass',
    title: 'Same geometry, different physical scale',
    question: 'Does a heavier Schwarzschild black hole bend a normalized ray differently?',
    observation: 'The path in rₛ units is unchanged; horizon size and physical time scale grow with mass.',
    impactParameter: 3.2,
    massExponent: 9,
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

const formatNumber = (value: number, digits = 3): string =>
  new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(value);

export class BlackHoleLab {
  private readonly renderer: GeodesicRenderer;
  private readonly impactInput: HTMLInputElement;
  private readonly massInput: HTMLInputElement;
  private readonly bundleButton: HTMLButtonElement;
  private readonly playButton: HTMLButtonElement;
  private readonly impactValue: HTMLElement;
  private readonly massValue: HTMLElement;
  private readonly outcomeValue: HTMLElement;
  private readonly closestValue: HTMLElement;
  private readonly deflectionValue: HTMLElement;
  private readonly horizonValue: HTMLElement;
  private readonly photonSphereValue: HTMLElement;
  private readonly experiments: GuidedExperiments<BlackHoleExperimentId>;
  private animationFrame = 0;
  private bundleVisible = true;
  private playing = true;
  private geodesic: NullGeodesic;

  constructor(root: HTMLElement) {
    root.innerHTML = this.createMarkup();
    const canvas = requireElement<HTMLCanvasElement>(root, '[data-geodesic-canvas]');
    this.impactInput = requireElement(root, '[data-impact]');
    this.massInput = requireElement(root, '[data-black-hole-mass]');
    this.bundleButton = requireElement(root, '[data-ray-bundle]');
    this.playButton = requireElement(root, '[data-geodesic-play]');
    this.impactValue = requireElement(root, '[data-impact-value]');
    this.massValue = requireElement(root, '[data-mass-value]');
    this.outcomeValue = requireElement(root, '[data-ray-outcome]');
    this.closestValue = requireElement(root, '[data-closest-approach]');
    this.deflectionValue = requireElement(root, '[data-deflection]');
    this.horizonValue = requireElement(root, '[data-horizon-size]');
    this.photonSphereValue = requireElement(root, '[data-photon-sphere-size]');
    this.renderer = new GeodesicRenderer(canvas);
    this.geodesic = this.renderer.setImpactParameter(Number(this.impactInput.value));
    this.experiments = new GuidedExperiments(
      requireElement(root, '.black-hole-viewport'),
      BLACK_HOLE_EXPERIMENTS,
      (id) => this.applyExperiment(id),
    );
    this.bindControls();
  }

  start(): void {
    this.updateModel();
    this.experiments.activate('strong-lensing', false);
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

  private bindControls(): void {
    this.impactInput.addEventListener('input', () => {
      this.experiments.setFreeMode();
      this.geodesic = this.renderer.setImpactParameter(Number(this.impactInput.value));
      this.updateModel();
    });
    this.massInput.addEventListener('input', () => {
      this.experiments.setFreeMode();
      this.updateModel();
    });
    this.bundleButton.addEventListener('click', () => {
      this.bundleVisible = !this.bundleVisible;
      this.renderer.setBundleVisible(this.bundleVisible);
      this.bundleButton.setAttribute('aria-pressed', String(this.bundleVisible));
      this.bundleButton.textContent = this.bundleVisible ? 'Ray bundle on' : 'Ray bundle off';
    });
    this.playButton.addEventListener('click', () => {
      this.playing = !this.playing;
      this.renderer.setPlaying(this.playing);
      this.playButton.setAttribute('aria-pressed', String(!this.playing));
      this.playButton.textContent = this.playing ? 'Pause photon' : 'Resume photon';
    });
  }

  private applyExperiment(id: BlackHoleExperimentId): void {
    const experiment = BLACK_HOLE_EXPERIMENTS.find((candidate) => candidate.id === id);
    if (experiment === undefined) {
      return;
    }
    this.impactInput.value = String(experiment.impactParameter);
    this.massInput.value = String(experiment.massExponent);
    this.geodesic = this.renderer.setImpactParameter(experiment.impactParameter);
    this.updateModel();
  }

  private updateModel(): void {
    const impact = Number(this.impactInput.value);
    const solarMasses = 10 ** Number(this.massInput.value);
    const horizonMetres = getSchwarzschildRadius(solarMasses);
    const horizonDisplay =
      horizonMetres >= 1e9
        ? `${formatNumber(horizonMetres / 1.495_978_707e11, 4)} au`
        : `${formatNumber(horizonMetres / 1_000, 2)} km`;
    const outcomeLabel =
      this.geodesic.outcome === 'captured'
        ? 'Captured by horizon'
        : this.geodesic.outcome === 'escaped'
          ? 'Escapes to infinity'
          : 'Near-critical orbit';

    this.impactValue.textContent = `${impact.toFixed(2)} rₛ`;
    this.massValue.textContent = `${solarMasses.toExponential(2)} M☉`;
    this.outcomeValue.textContent = outcomeLabel;
    this.outcomeValue.dataset.outcome = this.geodesic.outcome;
    this.closestValue.textContent = `${formatNumber(this.geodesic.closestApproach, 4)} rₛ`;
    this.deflectionValue.textContent =
      this.geodesic.outcome === 'escaped'
        ? `${formatNumber((this.geodesic.deflectionAngle * 180) / Math.PI, 3)}°`
        : 'Not asymptotic';
    this.horizonValue.textContent = horizonDisplay;
    this.photonSphereValue.textContent = `${formatNumber((horizonMetres * 1.5) / 1_000, 2)} km`;
  }

  private createMarkup(): string {
    return `
      <article class="black-hole-shell">
        <header class="black-hole-topbar">
          <div class="black-hole-brand">
            <span class="black-hole-mark" aria-hidden="true"><i></i></span>
            <span>Black Hole Optics Lab</span>
            <a href="?lab=catalog">All labs</a>
          </div>
          <div class="metric-badge">Schwarzschild · a = 0</div>
          <div class="black-hole-status"><span></span>Null geodesics</div>
        </header>

        <section class="black-hole-viewport" aria-label="Schwarzschild photon trajectories">
          <canvas data-geodesic-canvas aria-label="Light rays near a Schwarzschild black hole"></canvas>

          <div class="black-hole-heading">
            <p class="black-hole-eyebrow">Vacuum spacetime · geometric optics</p>
            <h1>Gravity bends light.</h1>
            <p>
              The highlighted photon follows an integrated null geodesic. Change its asymptotic
              impact parameter to cross the capture boundary at b = ${CRITICAL_IMPACT_PARAMETER.toFixed(3)}rₛ.
            </p>
            <div class="black-hole-warning">
              <span>GR</span>
              <p>No Newtonian force is applied to light; the path is a geodesic of curved spacetime.</p>
            </div>
          </div>

          <aside class="geodesic-panel" aria-label="Geodesic properties">
            <p class="black-hole-eyebrow">Integrated ray</p>
            <strong class="ray-outcome" data-ray-outcome>—</strong>
            <dl>
              <div><dt>Closest approach</dt><dd data-closest-approach>—</dd></div>
              <div><dt>Deflection</dt><dd data-deflection>—</dd></div>
              <div><dt>Event horizon rₛ</dt><dd data-horizon-size>—</dd></div>
              <div><dt>Photon sphere</dt><dd data-photon-sphere-size>—</dd></div>
            </dl>
            <p>Scale-invariant geometry; mass changes physical size and time, not the normalized ray.</p>
          </aside>

          <div class="geodesic-dock" aria-label="Black hole controls">
            <label class="geodesic-control">
              <span>Impact parameter <strong data-impact-value>3.20 rₛ</strong></span>
              <input data-impact type="range" min="0" max="8" value="3.2" step="0.01" />
            </label>
            <label class="geodesic-control">
              <span>Mass <strong data-mass-value>—</strong></span>
              <input data-black-hole-mass type="range" min="0" max="10" value="6.5" step="0.05" />
            </label>
            <div class="geodesic-buttons">
              <button type="button" data-ray-bundle aria-pressed="true">Ray bundle on</button>
              <button type="button" data-geodesic-play aria-pressed="false">Pause photon</button>
            </div>
          </div>
        </section>
      </article>
    `;
  }
}
