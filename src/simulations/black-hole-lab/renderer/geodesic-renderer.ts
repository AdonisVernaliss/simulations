import {
  CRITICAL_IMPACT_PARAMETER,
  EVENT_HORIZON_RADIUS,
  PHOTON_SPHERE_RADIUS,
  traceNullGeodesic,
  type NullGeodesic,
} from '../model/schwarzschild';

const OBSERVER_DISTANCE = 18;

export class GeodesicRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private readonly bundle: readonly NullGeodesic[];
  private selected = traceNullGeodesic(3.2, OBSERVER_DISTANCE);
  private bundleVisible = true;
  private playing = true;
  private progress = 0;
  private lastTimestamp = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('A two-dimensional canvas context is required.');
    }
    this.context = context;
    this.bundle = Array.from({ length: 23 }, (_, index) =>
      traceNullGeodesic(-7.7 + index * 0.7, OBSERVER_DISTANCE, 0.0025),
    );
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
  }

  setImpactParameter(impactParameter: number): NullGeodesic {
    this.selected = traceNullGeodesic(impactParameter, OBSERVER_DISTANCE);
    this.progress = 0;
    return this.selected;
  }

  setBundleVisible(visible: boolean): void {
    this.bundleVisible = visible;
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  render(timestamp: number): void {
    const elapsed = Math.min((timestamp - this.lastTimestamp) / 1_000, 0.1);
    this.lastTimestamp = timestamp;
    if (this.playing) {
      this.progress = (this.progress + elapsed * 0.13) % 1;
    }
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
  }

  private draw(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const centerX = width * 0.52;
    const centerY = height * 0.48;
    const scale = Math.min(width / 40, height / 20);
    this.context.clearRect(0, 0, width, height);
    this.drawStars(width, height);

    if (this.bundleVisible) {
      for (const ray of this.bundle) {
        this.drawRay(ray, centerX, centerY, scale, 1, false);
      }
    }

    this.drawBlackHole(centerX, centerY, scale);
    const visiblePoints = Math.max(2, Math.floor(this.selected.points.length * this.progress));
    this.drawRay(this.selected, centerX, centerY, scale, visiblePoints, true);
  }

  private drawStars(width: number, height: number): void {
    let seed = 0x67656f64;
    const random = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4_294_967_296;
    };
    this.context.save();
    for (let index = 0; index < 260; index += 1) {
      const alpha = 0.08 + random() * 0.22;
      this.context.fillStyle = `rgba(160, 205, 235, ${alpha})`;
      this.context.fillRect(random() * width, random() * height, 1, 1);
    }
    this.context.restore();
  }

  private drawBlackHole(centerX: number, centerY: number, scale: number): void {
    this.context.save();
    this.context.setLineDash([4, 5]);
    this.context.lineWidth = 1;
    this.context.strokeStyle = 'rgba(119, 195, 233, 0.24)';
    this.context.beginPath();
    this.context.arc(centerX, centerY, PHOTON_SPHERE_RADIUS * scale, 0, Math.PI * 2);
    this.context.stroke();
    this.context.setLineDash([]);

    const glow = this.context.createRadialGradient(
      centerX,
      centerY,
      EVENT_HORIZON_RADIUS * scale * 0.78,
      centerX,
      centerY,
      EVENT_HORIZON_RADIUS * scale * 1.35,
    );
    glow.addColorStop(0, 'rgba(0, 0, 0, 1)');
    glow.addColorStop(0.72, 'rgba(0, 0, 0, 1)');
    glow.addColorStop(0.82, 'rgba(255, 174, 80, 0.24)');
    glow.addColorStop(1, 'rgba(255, 174, 80, 0)');
    this.context.fillStyle = glow;
    this.context.beginPath();
    this.context.arc(centerX, centerY, EVENT_HORIZON_RADIUS * scale * 1.35, 0, Math.PI * 2);
    this.context.fill();

    this.context.fillStyle = '#000';
    this.context.beginPath();
    this.context.arc(centerX, centerY, EVENT_HORIZON_RADIUS * scale, 0, Math.PI * 2);
    this.context.fill();

    this.context.fillStyle = 'rgba(133, 199, 231, 0.7)';
    this.context.font = '10px Inter, sans-serif';
    this.context.fillText('rₛ', centerX + scale * 1.12, centerY + 4);
    this.context.fillStyle = 'rgba(104, 157, 187, 0.52)';
    this.context.fillText('photon sphere · 1.5rₛ', centerX + scale * 1.6, centerY - scale * 1.1);

    this.context.fillStyle = 'rgba(122, 191, 224, 0.68)';
    this.context.font = '9px Inter, sans-serif';
    this.context.fillText(
      `bcrit = ${CRITICAL_IMPACT_PARAMETER.toFixed(3)}rₛ`,
      centerX - scale * 3.25,
      centerY + scale * 3.5,
    );
    this.context.restore();
  }

  private drawRay(
    ray: NullGeodesic,
    centerX: number,
    centerY: number,
    scale: number,
    visiblePoints: number,
    selected: boolean,
  ): void {
    const count = selected ? Math.min(visiblePoints, ray.points.length) : ray.points.length;
    if (count < 2) {
      return;
    }

    this.context.save();
    this.context.beginPath();
    for (let index = 0; index < count; index += 1) {
      const point = ray.points[index];
      if (point === undefined) {
        continue;
      }
      const x = centerX + point.x * scale;
      const y = centerY - point.y * scale;
      if (index === 0) {
        this.context.moveTo(x, y);
      } else {
        this.context.lineTo(x, y);
      }
    }

    if (selected) {
      this.context.strokeStyle = ray.outcome === 'captured' ? '#ffae62' : '#68dcff';
      this.context.lineWidth = 2.2;
      this.context.shadowColor = this.context.strokeStyle;
      this.context.shadowBlur = 12;
      this.context.globalAlpha = 0.95;
    } else {
      this.context.strokeStyle =
        ray.outcome === 'captured' ? 'rgba(255, 155, 92, 0.15)' : 'rgba(93, 198, 238, 0.14)';
      this.context.lineWidth = 0.8;
    }
    this.context.stroke();

    if (selected) {
      const head = ray.points[count - 1];
      if (head !== undefined) {
        this.context.fillStyle = this.context.strokeStyle;
        this.context.beginPath();
        this.context.arc(centerX + head.x * scale, centerY - head.y * scale, 4, 0, Math.PI * 2);
        this.context.fill();
      }
    }
    this.context.restore();
  }
}
