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
      this.drawCurvatureConstruction(this.track, centerX, centerY, pixelsPerMetre);
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

    this.context.fillStyle = 'rgba(158, 221, 250, 0.78)';
    this.context.shadowColor = '#74d8ff';
    this.context.shadowBlur = 10;
    this.context.beginPath();
    this.context.arc(centerX, centerY, 3, 0, Math.PI * 2);
    this.context.fill();
    this.context.shadowBlur = 0;
    this.context.fillStyle = 'rgba(151, 188, 210, 0.66)';
    this.context.font = '10px Inter, sans-serif';
    this.context.fillText('interaction point · track starts here', centerX + 9, centerY - 9);
    this.context.fillStyle = 'rgba(101, 142, 165, 0.48)';
    this.context.fillText('concentric circles = detector layers, not particle orbits', centerX - 190, centerY + DETECTOR_RADIUS_METRES * scale + 18);
    this.context.restore();
  }

  private drawCurvatureConstruction(
    track: ParticleTrack,
    centerX: number,
    centerY: number,
    scale: number,
  ): void {
    const radius = track.kinematics.radius;
    if (!Number.isFinite(radius) || radius <= 0) {
      return;
    }

    const bendDirection = track.particle.charge * (track.magneticField < 0 ? -1 : 1);
    const curvatureCenterY = centerY - bendDirection * radius * scale;
    const radiusPixels = radius * scale;
    const forceDirection = -bendDirection;
    const forceLength = 48;

    this.context.save();
    this.context.setLineDash([4, 6]);
    this.context.strokeStyle = 'rgba(125, 198, 228, 0.2)';
    this.context.lineWidth = 1;
    this.context.beginPath();
    this.context.arc(centerX, curvatureCenterY, radiusPixels, 0, Math.PI * 2);
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(centerX, curvatureCenterY);
    this.context.lineTo(centerX, centerY);
    this.context.stroke();
    this.context.setLineDash([]);

    this.context.strokeStyle = 'rgba(129, 211, 245, 0.72)';
    this.context.beginPath();
    this.context.moveTo(centerX - 5, curvatureCenterY);
    this.context.lineTo(centerX + 5, curvatureCenterY);
    this.context.moveTo(centerX, curvatureCenterY - 5);
    this.context.lineTo(centerX, curvatureCenterY + 5);
    this.context.stroke();
    this.context.fillStyle = 'rgba(148, 196, 219, 0.7)';
    this.context.font = '10px Inter, sans-serif';
    this.context.fillText('geometric curvature centre · no object here', centerX + 9, curvatureCenterY - 8);
    this.context.fillText('R', centerX + 7, (curvatureCenterY + centerY) / 2);

    this.drawArrow(centerX, centerY, centerX + 54, centerY, 'rgba(143, 231, 255, 0.78)');
    this.context.fillStyle = 'rgba(143, 231, 255, 0.72)';
    this.context.fillText('velocity v', centerX + 61, centerY + 4);
    this.drawArrow(
      centerX,
      centerY,
      centerX,
      centerY + forceDirection * forceLength,
      'rgba(255, 183, 112, 0.82)',
    );
    this.context.fillStyle = 'rgba(255, 190, 125, 0.78)';
    this.context.fillText(
      'Lorentz force q(v × B)',
      centerX + 9,
      centerY + forceDirection * forceLength + (forceDirection < 0 ? -5 : 12),
    );
    this.context.restore();
  }

  private drawArrow(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    color: string,
  ): void {
    const angle = Math.atan2(endY - startY, endX - startX);
    this.context.strokeStyle = color;
    this.context.fillStyle = color;
    this.context.lineWidth = 1.4;
    this.context.beginPath();
    this.context.moveTo(startX, startY);
    this.context.lineTo(endX, endY);
    this.context.stroke();
    this.context.beginPath();
    this.context.moveTo(endX, endY);
    this.context.lineTo(endX - 8 * Math.cos(angle - 0.42), endY - 8 * Math.sin(angle - 0.42));
    this.context.lineTo(endX - 8 * Math.cos(angle + 0.42), endY - 8 * Math.sin(angle + 0.42));
    this.context.closePath();
    this.context.fill();
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
