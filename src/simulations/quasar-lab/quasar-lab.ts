import './quasar-lab.css';

import {
  INNER_RADIUS_RG,
  NOMINAL_SOLAR_MASS_PARAMETER,
  SPEED_OF_LIGHT,
  THIN_DISK_EFFICIENCY,
  getAccretionRate,
  getEddingtonLuminosity,
  getPeakDiskTemperature,
  getWienPeakWavelength,
} from './model/thin-disk';
import { ThinDiskRenderer } from './renderer/thin-disk-renderer';

const ASTRONOMICAL_UNIT_METRES = 149_597_870_700;

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
    this.renderer = new ThinDiskRenderer(
      requireElement<HTMLCanvasElement>(root, '[data-thin-disk-canvas]'),
    );
    this.bindControls(root);
  }

  start(): void {
    this.updateModel();
  }

  destroy(): void {
    this.renderer.destroy();
  }

  private bindControls(root: HTMLElement): void {
    this.massInput.addEventListener('input', () => this.updateModel());
    this.ratioInput.addEventListener('input', () => this.updateModel());
    root.querySelectorAll<HTMLButtonElement>('[data-mass-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const exponent = Number(button.dataset.massPreset);
        this.massInput.value = String(exponent);
        this.updateModel();
      });
    });
  }

  private updateModel(): void {
    const solarMasses = 10 ** Number(this.massInput.value);
    const eddingtonRatio = Number(this.ratioInput.value);
    const accretionRate = getAccretionRate(solarMasses, eddingtonRatio);
    const eddingtonLuminosity = getEddingtonLuminosity(solarMasses);
    const diskLuminosity = eddingtonRatio * eddingtonLuminosity;
    const peakTemperature = getPeakDiskTemperature(solarMasses, accretionRate);
    const peakWavelengthNm = getWienPeakWavelength(peakTemperature) * 1e9;
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
          <div class="quasar-status"><span></span>Analytic baseline</div>
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
                it does not simulate lensing, a corona, a jet, or magnetohydrodynamics.
              </p>
            </div>
          </div>

          <aside class="disk-panel" aria-label="Accretion disk properties">
            <p class="quasar-eyebrow">Model output</p>
            <strong>Thermal thin disk</strong>
            <dl>
              <div><dt>Disk luminosity</dt><dd data-disk-luminosity>—</dd></div>
              <div><dt>Accretion rate</dt><dd data-accretion-rate>—</dd></div>
              <div><dt>Peak temperature</dt><dd data-peak-temperature>—</dd></div>
              <div><dt>Local Wien peak</dt><dd data-peak-wavelength>—</dd></div>
              <div><dt>Inner edge · 6r<sub>g</sub></dt><dd data-inner-radius>—</dd></div>
            </dl>
            <p>
              Zero torque at 6r<sub>g</sub>; η = ${THIN_DISK_EFFICIENCY.toFixed(4)}. The Wien value
              belongs to the hottest local annulus, not the integrated spectrum.
            </p>
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
            <div class="disk-presets" aria-label="Mass presets">
              <button type="button" data-mass-preset="7">10⁷ M☉</button>
              <button type="button" data-mass-preset="8.5">10⁸⋅⁵ M☉</button>
              <button type="button" data-mass-preset="10">10¹⁰ M☉</button>
            </div>
          </div>
        </section>
      </article>
    `;
  }
}
