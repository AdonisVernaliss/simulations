import {
  INNER_RADIUS_RG,
  createDiskProfile,
  getAccretionRate,
  getDiskTemperature,
  getPeakDiskTemperature,
} from '../model/thin-disk';

const OUTER_DISPLAY_RADIUS_RG = 140;
const EVENT_HORIZON_RADIUS_RG = 2;

export type QuasarRegion = 'black-hole' | 'accretion-disk';

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
  private readonly staticCanvas: HTMLCanvasElement;
  private readonly staticContext: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private readonly motionEnabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private solarMasses = 10 ** 8.5;
  private eddingtonRatio = 0.2;
  private animationFrame = 0;
  private lastTimestamp = 0;
  private phase = 0;
  private selectedRegion: QuasarRegion = 'black-hole';
  private pointerDownX = 0;
  private pointerDownY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onRegionSelected: (region: QuasarRegion) => void = () => {},
  ) {
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('A two-dimensional canvas context is required.');
    }
    const staticCanvas = document.createElement('canvas');
    const staticContext = staticCanvas.getContext('2d');
    if (staticContext === null) {
      throw new Error('A two-dimensional canvas context is required.');
    }
    this.context = context;
    this.staticCanvas = staticCanvas;
    this.staticContext = staticContext;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.resize();
  }

  start(): void {
    if (!this.motionEnabled || this.animationFrame !== 0) {
      this.present();
      return;
    }
    this.animationFrame = requestAnimationFrame(this.render);
  }

  setParameters(solarMasses: number, eddingtonRatio: number): void {
    this.solarMasses = solarMasses;
    this.eddingtonRatio = eddingtonRatio;
    this.drawStatic();
    this.present();
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
  }

  private readonly render = (timestamp: number): void => {
    const elapsed = this.lastTimestamp === 0 ? 0 : Math.min(timestamp - this.lastTimestamp, 100);
    if (this.lastTimestamp === 0 || elapsed >= 32) {
      this.phase += (elapsed / 1_000) * 0.34;
      this.present();
      this.lastTimestamp = timestamp;
    }
    this.animationFrame = requestAnimationFrame(this.render);
  };

  private resize(): void {
    const parent = this.canvas.parentElement;
    const cssWidth = Math.max(parent?.clientWidth ?? this.canvas.clientWidth, 1);
    const cssHeight = Math.max(parent?.clientHeight ?? this.canvas.clientHeight, 1);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.canvas.width = Math.round(cssWidth * pixelRatio);
    this.canvas.height = Math.round(cssHeight * pixelRatio);
    this.staticCanvas.width = Math.round(cssWidth * pixelRatio);
    this.staticCanvas.height = Math.round(cssHeight * pixelRatio);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.staticContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.drawStatic();
    this.present();
  }

  private getGeometry(): {
    readonly width: number;
    readonly height: number;
    readonly centerX: number;
    readonly centerY: number;
    readonly outerRadius: number;
    readonly verticalScale: number;
  } {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    return {
      width,
      height,
      centerX: width * (width < 760 ? 0.5 : 0.58),
      centerY: height * (width < 760 ? 0.43 : 0.48),
      outerRadius: Math.min(width * (width < 760 ? 0.48 : 0.34), height * 0.39),
      verticalScale: width < 760 ? 0.3 : 0.34,
    };
  }

  private drawStatic(): void {
    const { width, height, centerX, centerY, outerRadius, verticalScale } = this.getGeometry();
    this.staticContext.clearRect(0, 0, width, height);
    this.drawStars(width, height);
    this.drawDisk(centerX, centerY, outerRadius, verticalScale);
    this.drawReferenceGeometry(centerX, centerY, outerRadius, verticalScale);
  }

  private present(): void {
    const { width, height, centerX, centerY, outerRadius, verticalScale } = this.getGeometry();
    this.context.clearRect(0, 0, width, height);
    this.context.drawImage(this.staticCanvas, 0, 0, width, height);
    this.drawOrbitalTracers(centerX, centerY, outerRadius, verticalScale);
    this.drawSelection(centerX, centerY, outerRadius, verticalScale);
  }

  private drawStars(width: number, height: number): void {
    let seed = 0x6469736b;
    const random = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4_294_967_296;
    };

    const context = this.staticContext;
    context.save();
    for (let index = 0; index < 230; index += 1) {
      const alpha = 0.06 + random() * 0.2;
      context.fillStyle = `rgba(187, 211, 239, ${alpha})`;
      const size = random() > 0.94 ? 1.4 : 0.8;
      context.fillRect(random() * width, random() * height, size, size);
    }
    context.restore();
  }

  private drawDisk(
    centerX: number,
    centerY: number,
    outerRadius: number,
    verticalScale: number,
  ): void {
    const profile = createDiskProfile(this.solarMasses, this.eddingtonRatio, 240, OUTER_DISPLAY_RADIUS_RG);
    const context = this.staticContext;
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let index = profile.length - 1; index > 0; index -= 1) {
      const annulus = profile[index];
      const previous = profile[index - 1];
      if (annulus === undefined || previous === undefined || annulus.temperature <= 0) {
        continue;
      }
      const radius = this.toDisplayRadius(annulus.radiusRg, outerRadius);
      const previousRadius = this.toDisplayRadius(previous.radiusRg, outerRadius);
      const temperatureFraction = clamp((Math.log10(annulus.temperature) - 3.35) / 2.15, 0, 1);
      const luminosityGain = 0.48 + 0.52 * Math.sqrt(this.eddingtonRatio);
      const alpha = (0.34 + temperatureFraction * 0.6) * luminosityGain;
      context.strokeStyle = interpolateColour(temperatureFraction, alpha);
      context.lineWidth = Math.max((radius - previousRadius) * 1.75, 1.25);
      context.shadowColor = interpolateColour(temperatureFraction, 0.52);
      context.shadowBlur = 3 + temperatureFraction * 11;
      context.beginPath();
      context.ellipse(centerX, centerY, radius, radius * verticalScale, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  private drawReferenceGeometry(
    centerX: number,
    centerY: number,
    outerRadius: number,
    verticalScale: number,
  ): void {
    const innerRadius = this.toDisplayRadius(INNER_RADIUS_RG, outerRadius);
    const horizonRadius = this.toDisplayRadius(EVENT_HORIZON_RADIUS_RG, outerRadius);

    const context = this.staticContext;
    context.save();
    context.strokeStyle = 'rgba(248, 209, 151, 0.3)';
    context.lineWidth = 1;
    context.setLineDash([3, 5]);
    context.beginPath();
    context.ellipse(
      centerX,
      centerY,
      innerRadius,
      innerRadius * verticalScale,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
    context.setLineDash([]);

    const glow = context.createRadialGradient(
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
    context.fillStyle = glow;
    context.beginPath();
    context.arc(centerX, centerY, horizonRadius * 1.7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#000';
    context.beginPath();
    context.arc(centerX, centerY, horizonRadius, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = 'rgba(236, 202, 161, 0.58)';
    context.font = '10px Inter, sans-serif';
    context.fillText('inner edge · 6r_g', centerX + innerRadius + 8, centerY - 7);
    context.restore();
  }

  private drawOrbitalTracers(
    centerX: number,
    centerY: number,
    outerRadius: number,
    verticalScale: number,
  ): void {
    const radii = [8.3, 9.7, 12, 15, 19, 25, 34, 48, 68, 96, 126] as const;
    const peakTemperature = getPeakDiskTemperature(
      this.solarMasses,
      getAccretionRate(this.solarMasses, this.eddingtonRatio),
    );
    const accretionRate = getAccretionRate(this.solarMasses, this.eddingtonRatio);
    const massRate = (this.solarMasses / 10 ** 8.5) ** -1;

    this.context.save();
    this.context.globalCompositeOperation = 'lighter';
    radii.forEach((radiusRg, index) => {
      const displayRadius = this.toDisplayRadius(radiusRg, outerRadius);
      const angularRate = (8.3 / radiusRg) ** 1.5;
      const angle = index * 2.399_963 + this.phase * angularRate * massRate;
      const temperature = getDiskTemperature(this.solarMasses, accretionRate, radiusRg);
      const temperatureFraction = clamp(
        (Math.log10(temperature / peakTemperature) + 1.32) / 1.32,
        0,
        1,
      );
      const onNearSide = Math.sin(angle) >= 0;
      const x = centerX + Math.cos(angle) * displayRadius;
      const y = centerY + Math.sin(angle) * displayRadius * verticalScale;
      this.context.fillStyle = interpolateColour(temperatureFraction, onNearSide ? 0.95 : 0.3);
      this.context.shadowColor = interpolateColour(temperatureFraction, 0.9);
      this.context.shadowBlur = onNearSide ? 11 : 4;
      this.context.beginPath();
      this.context.arc(x, y, onNearSide ? 2.4 : 1.5, 0, Math.PI * 2);
      this.context.fill();
    });
    this.context.restore();
  }

  private toDisplayRadius(radiusRg: number, outerRadius: number): number {
    return Math.sqrt(radiusRg / OUTER_DISPLAY_RADIUS_RG) * outerRadius;
  }

  private drawSelection(
    centerX: number,
    centerY: number,
    outerRadius: number,
    verticalScale: number,
  ): void {
    this.context.save();
    this.context.strokeStyle = 'rgba(139, 220, 255, 0.68)';
    this.context.shadowColor = 'rgba(95, 188, 255, 0.8)';
    this.context.shadowBlur = 10;
    this.context.lineWidth = 1;
    this.context.setLineDash([4, 5]);
    this.context.beginPath();
    if (this.selectedRegion === 'black-hole') {
      const horizonRadius = this.toDisplayRadius(EVENT_HORIZON_RADIUS_RG, outerRadius);
      this.context.arc(centerX, centerY, horizonRadius * 1.55, 0, Math.PI * 2);
    } else {
      const innerRadius = this.toDisplayRadius(INNER_RADIUS_RG, outerRadius);
      this.context.ellipse(centerX, centerY, innerRadius * 1.08, innerRadius * verticalScale * 1.08, 0, 0, Math.PI * 2);
    }
    this.context.stroke();
    this.context.restore();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY) > 6) {
      return;
    }
    const bounds = this.canvas.getBoundingClientRect();
    const { centerX, centerY, outerRadius, verticalScale } = this.getGeometry();
    const x = event.clientX - bounds.left - centerX;
    const y = event.clientY - bounds.top - centerY;
    const circularRadius = Math.hypot(x, y);
    const horizonRadius = this.toDisplayRadius(EVENT_HORIZON_RADIUS_RG, outerRadius);
    const diskRadius = Math.hypot(x / outerRadius, y / (outerRadius * verticalScale));
    let region: QuasarRegion | undefined;

    if (circularRadius <= horizonRadius * 1.9) {
      region = 'black-hole';
    } else if (diskRadius <= 1.08) {
      region = 'accretion-disk';
    }

    if (region !== undefined) {
      this.selectedRegion = region;
      this.canvas.dataset.selection = region;
      this.onRegionSelected(region);
      this.present();
    }
  };
}
