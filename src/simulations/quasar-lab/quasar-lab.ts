import './quasar-lab.css';

import {
  INNER_RADIUS_RG,
  NOMINAL_SOLAR_MASS_PARAMETER,
  SPEED_OF_LIGHT,
  THIN_DISK_EFFICIENCY,
  getAccretionRate,
  getEddingtonLuminosity,
  getKeplerianPeriod,
  getPeakDiskTemperature,
  getWienPeakWavelength,
} from './model/thin-disk';
import {
  ThinDiskRenderer,
  type QuasarRegion,
} from './renderer/thin-disk-renderer';

const ASTRONOMICAL_UNIT_METRES = 149_597_870_700;

interface QuasarExperiment {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly observation: string;
  readonly massExponent: number;
  readonly eddingtonRatio: number;
}

const QUASAR_EXPERIMENTS: readonly QuasarExperiment[] = [
  {
    id: 'reference',
    label: 'Reference',
    title: 'A reference luminous quasar',
    observation: 'Use this as the baseline, then compare one physical change at a time.',
    massExponent: 8.5,
    eddingtonRatio: 0.2,
  },
  {
    id: 'hotter',
    label: 'Smaller · hotter',
    title: 'Why smaller holes have hotter disks',
    observation: 'At the same Eddington ratio, lowering mass raises temperature as M⁻¹⁄⁴.',
    massExponent: 7,
    eddingtonRatio: 0.2,
  },
  {
    id: 'cooler',
    label: 'Giant · cooler',
    title: 'A giant hole shifts the thermal peak',
    observation: 'The larger physical disk is cooler and its hottest annulus peaks at a longer wavelength.',
    massExponent: 10,
    eddingtonRatio: 0.2,
  },
  {
    id: 'feeding',
    label: 'Feed faster',
    title: 'Approach the Eddington boundary',
    observation: 'Five times the luminosity raises temperature only by 5¹⁄⁴; thin-disk assumptions are now strained.',
    massExponent: 8.5,
    eddingtonRatio: 1,
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

const formatScientific = (value: number, digits = 2): string => value.toExponential(digits);

const formatDistance = (metres: number): string =>
  metres >= ASTRONOMICAL_UNIT_METRES * 0.01
    ? `${formatNumber(metres / ASTRONOMICAL_UNIT_METRES, 4)} au`
    : `${formatNumber(metres / 1_000, 1)} km`;

const formatDuration = (seconds: number): string => {
  if (seconds < 3_600) {
    return `${formatNumber(seconds / 60, 1)} min`;
  }
  if (seconds < 86_400) {
    return `${formatNumber(seconds / 3_600, 1)} h`;
  }
  if (seconds < 31_557_600) {
    return `${formatNumber(seconds / 86_400, 2)} d`;
  }
  return `${formatNumber(seconds / 31_557_600, 2)} yr`;
};

export class QuasarLab {
  private readonly renderer: ThinDiskRenderer;
  private readonly massInput: HTMLInputElement;
  private readonly ratioInput: HTMLInputElement;
  private readonly massValue: HTMLElement;
  private readonly ratioValue: HTMLElement;
  private readonly luminosityValue: HTMLElement;
  private readonly accretionValue: HTMLElement;
  private readonly temperatureValue: HTMLElement;
  private readonly wavelengthValue: HTMLElement;
  private readonly innerRadiusValue: HTMLElement;
  private readonly periodValue: HTMLElement;
  private readonly experimentTitle: HTMLElement;
  private readonly experimentObservation: HTMLElement;
  private readonly experimentButtons: readonly HTMLButtonElement[];
  private readonly selectedRegionName: HTMLElement;
  private readonly selectedRegionDescription: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = this.createMarkup();
    this.massInput = requireElement(root, '[data-quasar-mass]');
    this.ratioInput = requireElement(root, '[data-eddington-ratio]');
    this.massValue = requireElement(root, '[data-quasar-mass-value]');
    this.ratioValue = requireElement(root, '[data-eddington-ratio-value]');
    this.luminosityValue = requireElement(root, '[data-disk-luminosity]');
    this.accretionValue = requireElement(root, '[data-accretion-rate]');
    this.temperatureValue = requireElement(root, '[data-peak-temperature]');
    this.wavelengthValue = requireElement(root, '[data-peak-wavelength]');
    this.innerRadiusValue = requireElement(root, '[data-inner-radius]');
    this.periodValue = requireElement(root, '[data-orbital-period]');
    this.experimentTitle = requireElement(root, '[data-experiment-title]');
    this.experimentObservation = requireElement(root, '[data-experiment-observation]');
    this.experimentButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-experiment]')];
    this.selectedRegionName = requireElement(root, '[data-selected-region]');
    this.selectedRegionDescription = requireElement(root, '[data-selected-region-description]');
    this.renderer = new ThinDiskRenderer(
      requireElement<HTMLCanvasElement>(root, '[data-thin-disk-canvas]'),
      (region) => this.selectRegion(region),
    );
    this.bindControls(root);
  }

  start(): void {
    this.activateExperiment('reference');
    this.selectRegion('black-hole');
    this.renderer.start();
  }

  destroy(): void {
    this.renderer.destroy();
  }

  private bindControls(root: HTMLElement): void {
    this.massInput.addEventListener('input', () => this.activateFreeMode());
    this.ratioInput.addEventListener('input', () => this.activateFreeMode());
    root.querySelectorAll<HTMLButtonElement>('[data-experiment]').forEach((button) => {
      button.addEventListener('click', () => {
        this.activateExperiment(button.dataset.experiment ?? 'reference');
      });
    });
  }

  private activateExperiment(id: string): void {
    const experiment = QUASAR_EXPERIMENTS.find((candidate) => candidate.id === id);
    if (experiment === undefined) {
      return;
    }
    this.massInput.value = String(experiment.massExponent);
    this.ratioInput.value = String(experiment.eddingtonRatio);
    this.experimentTitle.textContent = experiment.title;
    this.experimentObservation.textContent = experiment.observation;
    this.experimentButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.experiment === id));
    });
    this.updateModel();
  }

  private activateFreeMode(): void {
    this.experimentTitle.textContent = 'Free experiment';
    this.experimentObservation.textContent =
      'Change one control, watch the measured output, then compare it with a guided experiment.';
    this.experimentButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
    this.updateModel();
  }

  private updateModel(): void {
    const solarMasses = 10 ** Number(this.massInput.value);
    const eddingtonRatio = Number(this.ratioInput.value);
    const accretionRate = getAccretionRate(solarMasses, eddingtonRatio);
    const eddingtonLuminosity = getEddingtonLuminosity(solarMasses);
    const diskLuminosity = eddingtonRatio * eddingtonLuminosity;
    const peakTemperature = getPeakDiskTemperature(solarMasses, accretionRate);
    const peakWavelengthNm = getWienPeakWavelength(peakTemperature) * 1e9;
    const peakRadiusRg = (49 / 36) * INNER_RADIUS_RG;
    const orbitalPeriod = getKeplerianPeriod(solarMasses, peakRadiusRg);
    const gravitationalRadius =
      (NOMINAL_SOLAR_MASS_PARAMETER * solarMasses) / SPEED_OF_LIGHT ** 2;

    this.renderer.setParameters(solarMasses, eddingtonRatio);
    this.massValue.textContent = `${solarMasses.toExponential(2)} M☉`;
    this.ratioValue.textContent = eddingtonRatio.toFixed(2);
    this.luminosityValue.textContent = `${formatScientific(diskLuminosity)} W`;
    this.accretionValue.textContent = `${formatScientific(accretionRate)} kg s⁻¹`;
    this.temperatureValue.textContent = `${formatNumber(peakTemperature, 0)} K`;
    this.wavelengthValue.textContent = `${formatNumber(peakWavelengthNm, 1)} nm`;
    this.innerRadiusValue.textContent = formatDistance(INNER_RADIUS_RG * gravitationalRadius);
    this.periodValue.textContent = formatDuration(orbitalPeriod);
  }

  private selectRegion(region: QuasarRegion): void {
    const descriptions: Record<QuasarRegion, readonly [string, string]> = {
      'black-hole': [
        'Central black hole',
        'The compact mass supplies the gravitational field. The dark centre is an observable shadow; the event horizon lies inside it.',
      ],
      'accretion-disk': [
        'Thermal accretion disk',
        'Orbiting gas dissipates energy and radiates locally. It is luminous matter around the black hole, not part of the horizon.',
      ],
    };
    const [name, description] = descriptions[region];
    this.selectedRegionName.textContent = name;
    this.selectedRegionDescription.textContent = description;
  }

  private createMarkup(): string {
    return `
      <article class="quasar-shell">
        <header class="quasar-topbar">
          <div class="quasar-brand">
            <span class="quasar-mark" aria-hidden="true"><i></i></span>
            <span>Quasar Engine Lab</span>
            <a href="?lab=catalog">All labs</a>
          </div>
          <div class="quasar-model-badge">Thin disk · a = 0</div>
          <div class="quasar-status"><span></span>Live orbital flow</div>
        </header>

        <section class="quasar-viewport" aria-label="Thin accretion disk model">
          <canvas
            data-thin-disk-canvas
            aria-label="False-colour effective-temperature structure of a thin accretion disk"
          ></canvas>

          <div class="quasar-heading">
            <p class="quasar-eyebrow">Optically thick · geometrically thin</p>
            <h1>A quasar starts with accretion.</h1>
            <p>
              Each annulus radiates its locally dissipated flux as a blackbody. Mass and
              Eddington ratio set the temperature scale of the disk around a non-spinning hole.
            </p>
            <div class="quasar-warning">
              <span>F(r)</span>
              <p>
                False colour shows effective temperature. The display compresses radius as √r;
                moving tracers follow Ω ∝ r⁻³⁄² with time compressed independently of mass.
              </p>
            </div>
          </div>

          <aside class="disk-panel" aria-label="Accretion disk properties">
            <p class="quasar-eyebrow">Model output</p>
            <strong>Thermal thin disk</strong>
            <div class="quasar-object-selection">
              <span>Selected component</span>
              <strong data-selected-region>Central black hole</strong>
              <p data-selected-region-description>—</p>
            </div>
            <div class="disk-observation">
              <span>Current experiment</span>
              <strong data-experiment-title>—</strong>
              <p data-experiment-observation>—</p>
            </div>
            <dl>
              <div><dt>Disk luminosity</dt><dd data-disk-luminosity>—</dd></div>
              <div><dt>Accretion rate</dt><dd data-accretion-rate>—</dd></div>
              <div><dt>Peak temperature</dt><dd data-peak-temperature>—</dd></div>
              <div><dt>Local Wien peak</dt><dd data-peak-wavelength>—</dd></div>
              <div><dt>Inner edge · 6r<sub>g</sub></dt><dd data-inner-radius>—</dd></div>
              <div><dt>Orbit at hottest annulus</dt><dd data-orbital-period>—</dd></div>
            </dl>
            <p class="disk-assumption">
              Zero torque at 6r<sub>g</sub>; η = ${THIN_DISK_EFFICIENCY.toFixed(4)}. The Wien value
              belongs to the hottest local annulus, not the integrated spectrum.
            </p>
            <a class="quasar-system-link" href="?lab=orbital&amp;preset=quasar-system">
              Open live gravity scene · add objects
            </a>
          </aside>

          <div class="disk-dock" aria-label="Accretion disk controls">
            <label class="disk-control">
              <span>Black-hole mass <strong data-quasar-mass-value>—</strong></span>
              <input data-quasar-mass type="range" min="6" max="10" value="8.5" step="0.02" />
            </label>
            <label class="disk-control">
              <span>Eddington ratio <strong data-eddington-ratio-value>0.20</strong></span>
              <input data-eddington-ratio type="range" min="0.01" max="1" value="0.2" step="0.01" />
            </label>
            <div class="disk-presets" aria-label="Guided experiments">
              ${QUASAR_EXPERIMENTS.map(
                (experiment) => `
                  <button type="button" data-experiment="${experiment.id}" aria-pressed="false">
                    ${experiment.label}
                  </button>
                `,
              ).join('')}
            </div>
          </div>
        </section>
      </article>
    `;
  }
}
