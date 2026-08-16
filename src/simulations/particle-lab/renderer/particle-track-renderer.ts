import type { ParticleTrack } from '../model/charged-particle';

const DETECTOR_RADIUS_METRES = 2;

export class ParticleTrackRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private track: ParticleTrack | undefined;
  private progress = 0;
  private lastTimestamp = performance.now();
  private playing = true;

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

  setTrack(track: ParticleTrack): void {
    this.track = track;
    this.progress = 0;
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  render(timestamp: number): void {
    const elapsed = Math.min((timestamp - this.lastTimestamp) / 1_000, 0.1);
    this.lastTimestamp = timestamp;
    if (this.playing) {
      this.progress = (this.progress + elapsed * 0.16) % 1;
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
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const pixelsPerMetre = Math.min(width, height) * 0.2;
    this.context.clearRect(0, 0, width, height);
    this.drawField(width, height);
    this.drawDetector(centerX, centerY, pixelsPerMetre);

    if (this.track !== undefined) {
      this.drawTrack(this.track, centerX, centerY, pixelsPerMetre);
    }
  }

  private drawField(width: number, height: number): void {
    const field = this.track?.magneticField ?? 0;
    const spacing = 58;
    this.context.save();
    this.context.strokeStyle = 'rgba(91, 174, 215, 0.12)';
    this.context.fillStyle = 'rgba(91, 174, 215, 0.12)';
    this.context.lineWidth = 1;

    for (let x = spacing / 2; x < width; x += spacing) {
      for (let y = spacing / 2; y < height; y += spacing) {
        if (field >= 0) {
          this.context.beginPath();
          this.context.arc(x, y, 1.7, 0, Math.PI * 2);
          this.context.fill();
        } else {
          this.context.beginPath();
          this.context.moveTo(x - 2.5, y - 2.5);
          this.context.lineTo(x + 2.5, y + 2.5);
          this.context.moveTo(x + 2.5, y - 2.5);
          this.context.lineTo(x - 2.5, y + 2.5);
          this.context.stroke();
        }
      }
    }
    this.context.restore();
  }

  private drawDetector(centerX: number, centerY: number, scale: number): void {
    this.context.save();
    this.context.lineWidth = 1;
    for (const radius of [0.5, 1, 1.5, DETECTOR_RADIUS_METRES]) {
      this.context.beginPath();
      this.context.arc(centerX, centerY, radius * scale, 0, Math.PI * 2);
      this.context.strokeStyle =
        radius === DETECTOR_RADIUS_METRES
          ? 'rgba(103, 202, 244, 0.22)'
          : 'rgba(103, 202, 244, 0.09)';
      this.context.stroke();
    }

    this.context.strokeStyle = 'rgba(103, 202, 244, 0.07)';
    this.context.beginPath();
    this.context.moveTo(centerX - DETECTOR_RADIUS_METRES * scale, centerY);
    this.context.lineTo(centerX + DETECTOR_RADIUS_METRES * scale, centerY);
    this.context.moveTo(centerX, centerY - DETECTOR_RADIUS_METRES * scale);
    this.context.lineTo(centerX, centerY + DETECTOR_RADIUS_METRES * scale);
    this.context.stroke();

    this.context.fillStyle = '#f4dba0';
    this.context.shadowColor = '#ffc65f';
    this.context.shadowBlur = 14;
    this.context.beginPath();
    this.context.arc(centerX, centerY, 4, 0, Math.PI * 2);
    this.context.fill();
    this.context.restore();
  }

  private drawTrack(
    track: ParticleTrack,
    centerX: number,
    centerY: number,
    scale: number,
  ): void {
    const visiblePointCount = Math.max(2, Math.floor(track.points.length * this.progress));
    this.context.save();
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    this.context.shadowColor = track.particle.color;
    this.context.shadowBlur = 10;

    for (let index = 1; index < visiblePointCount; index += 1) {
      const previous = track.points[index - 1];
      const point = track.points[index];
      if (previous === undefined || point === undefined) {
        continue;
      }
      this.context.beginPath();
      this.context.moveTo(centerX + previous.x * scale, centerY + previous.y * scale);
      this.context.lineTo(centerX + point.x * scale, centerY + point.y * scale);
      this.context.globalAlpha = 0.15 + point.survival * 0.8;
      this.context.strokeStyle = track.particle.color;
      this.context.lineWidth = 2.1;
      this.context.stroke();
    }

    const head = track.points[visiblePointCount - 1];
    if (head !== undefined) {
      this.context.globalAlpha = 1;
      this.context.fillStyle = track.particle.color;
      this.context.shadowBlur = 18;
      this.context.beginPath();
      this.context.arc(centerX + head.x * scale, centerY + head.y * scale, 4.2, 0, Math.PI * 2);
      this.context.fill();
    }
    this.context.restore();
  }
}
