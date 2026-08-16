import {
  INNER_RADIUS_RG,
  createDiskProfile,
  getAccretionRate,
  getPeakDiskTemperature,
} from '../model/thin-disk';

const OUTER_DISPLAY_RADIUS_RG = 140;
const EVENT_HORIZON_RADIUS_RG = 2;

interface ColourStop {
  readonly position: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

const COLOUR_STOPS: readonly ColourStop[] = [
  { position: 0, red: 41, green: 4, blue: 28 },
  { position: 0.24, red: 111, green: 13, blue: 42 },
  { position: 0.5, red: 219, green: 51, blue: 46 },
  { position: 0.76, red: 255, green: 174, blue: 73 },
  { position: 1, red: 229, green: 245, blue: 255 },
] as const;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const interpolateColour = (fraction: number, alpha: number): string => {
  const normalized = clamp(fraction, 0, 1);
  const upperIndex = COLOUR_STOPS.findIndex((stop) => stop.position >= normalized);
  const upper = COLOUR_STOPS[Math.max(upperIndex, 1)] ?? COLOUR_STOPS.at(-1)!;
  const lower = COLOUR_STOPS[Math.max(upperIndex - 1, 0)] ?? COLOUR_STOPS[0]!;
  const span = upper.position - lower.position;
  const local = span === 0 ? 0 : (normalized - lower.position) / span;
  const channel = (start: number, end: number): number => Math.round(start + (end - start) * local);
  return `rgba(${channel(lower.red, upper.red)}, ${channel(lower.green, upper.green)}, ${channel(lower.blue, upper.blue)}, ${alpha})`;
};

export class ThinDiskRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private solarMasses = 10 ** 8.5;
  private eddingtonRatio = 0.2;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('A two-dimensional canvas context is required.');
    }
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  setParameters(solarMasses: number, eddingtonRatio: number): void {
    this.solarMasses = solarMasses;
    this.eddingtonRatio = eddingtonRatio;
    this.draw();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    const cssWidth = Math.max(parent?.clientWidth ?? this.canvas.clientWidth, 1);
    const cssHeight = Math.max(parent?.clientHeight ?? this.canvas.clientHeight, 1);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(cssWidth * pixelRatio);
    this.canvas.height = Math.round(cssHeight * pixelRatio);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.draw();
  }

  private draw(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.context.clearRect(0, 0, width, height);
    this.drawStars(width, height);

    const centerX = width * (width < 760 ? 0.5 : 0.58);
    const centerY = height * (width < 760 ? 0.43 : 0.48);
    const outerRadius = Math.min(width * (width < 760 ? 0.48 : 0.34), height * 0.39);
    const verticalScale = width < 760 ? 0.3 : 0.34;
    this.drawDisk(centerX, centerY, outerRadius, verticalScale);
    this.drawReferenceGeometry(centerX, centerY, outerRadius, verticalScale);
  }

  private drawStars(width: number, height: number): void {
    let seed = 0x6469736b;
    const random = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4_294_967_296;
    };

    this.context.save();
    for (let index = 0; index < 230; index += 1) {
      const alpha = 0.06 + random() * 0.2;
      this.context.fillStyle = `rgba(187, 211, 239, ${alpha})`;
      const size = random() > 0.94 ? 1.4 : 0.8;
      this.context.fillRect(random() * width, random() * height, size, size);
    }
    this.context.restore();
  }

  private drawDisk(
    centerX: number,
    centerY: number,
    outerRadius: number,
    verticalScale: number,
  ): void {
    const profile = createDiskProfile(this.solarMasses, this.eddingtonRatio, 240, OUTER_DISPLAY_RADIUS_RG);
    const peakTemperature = getPeakDiskTemperature(
      this.solarMasses,
      getAccretionRate(this.solarMasses, this.eddingtonRatio),
    );

    this.context.save();
    this.context.globalCompositeOperation = 'lighter';
    for (let index = profile.length - 1; index > 0; index -= 1) {
      const annulus = profile[index];
      const previous = profile[index - 1];
      if (annulus === undefined || previous === undefined || annulus.temperature <= 0) {
        continue;
      }
      const radius = this.toDisplayRadius(annulus.radiusRg, outerRadius);
      const previousRadius = this.toDisplayRadius(previous.radiusRg, outerRadius);
      const temperatureFraction = clamp(
        (Math.log10(annulus.temperature / peakTemperature) + 1.32) / 1.32,
        0,
        1,
      );
      const alpha = 0.48 + temperatureFraction * 0.42;
      this.context.strokeStyle = interpolateColour(temperatureFraction, alpha);
      this.context.lineWidth = Math.max((radius - previousRadius) * 1.75, 1.25);
      this.context.shadowColor = interpolateColour(temperatureFraction, 0.52);
      this.context.shadowBlur = 3 + temperatureFraction * 11;
      this.context.beginPath();
      this.context.ellipse(centerX, centerY, radius, radius * verticalScale, 0, 0, Math.PI * 2);
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawReferenceGeometry(
    centerX: number,
    centerY: number,
    outerRadius: number,
    verticalScale: number,
  ): void {
    const innerRadius = this.toDisplayRadius(INNER_RADIUS_RG, outerRadius);
    const horizonRadius = this.toDisplayRadius(EVENT_HORIZON_RADIUS_RG, outerRadius);

    this.context.save();
    this.context.strokeStyle = 'rgba(248, 209, 151, 0.3)';
    this.context.lineWidth = 1;
    this.context.setLineDash([3, 5]);
    this.context.beginPath();
    this.context.ellipse(
      centerX,
      centerY,
      innerRadius,
      innerRadius * verticalScale,
      0,
      0,
      Math.PI * 2,
    );
    this.context.stroke();
    this.context.setLineDash([]);

    const glow = this.context.createRadialGradient(
      centerX,
      centerY,
      horizonRadius * 0.55,
      centerX,
      centerY,
      horizonRadius * 1.7,
    );
    glow.addColorStop(0, '#000');
    glow.addColorStop(0.62, '#000');
    glow.addColorStop(0.72, 'rgba(255, 199, 124, 0.23)');
    glow.addColorStop(1, 'rgba(255, 156, 68, 0)');
    this.context.fillStyle = glow;
    this.context.beginPath();
    this.context.arc(centerX, centerY, horizonRadius * 1.7, 0, Math.PI * 2);
    this.context.fill();
    this.context.fillStyle = '#000';
    this.context.beginPath();
    this.context.arc(centerX, centerY, horizonRadius, 0, Math.PI * 2);
    this.context.fill();

    this.context.fillStyle = 'rgba(236, 202, 161, 0.58)';
    this.context.font = '10px Inter, sans-serif';
    this.context.fillText('inner edge · 6r_g', centerX + innerRadius + 8, centerY - 7);
    this.context.restore();
  }

  private toDisplayRadius(radiusRg: number, outerRadius: number): number {
    return Math.sqrt(radiusRg / OUTER_DISPLAY_RADIUS_RG) * outerRadius;
  }

}
