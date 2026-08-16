import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  GridHelper,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { BodyMetadata } from '../worker-protocol';

export type QualityLevel = 'low' | 'balanced' | 'high';

interface QualityProfile {
  readonly maximumPixelRatio: number;
  readonly starCount: number;
}

const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { maximumPixelRatio: 1, starCount: 350 },
  balanced: { maximumPixelRatio: 1.5, starCount: 700 },
  high: { maximumPixelRatio: 2, starCount: 1_200 },
};

const MAXIMUM_STARS = QUALITY_PROFILES.high.starCount;
const TRAIL_POINT_CAPACITY = 520;

class BodyTrail {
  readonly line: Line;

  private readonly positions = new Float32Array(TRAIL_POINT_CAPACITY * 2 * 3);
  private readonly positionAttribute = new BufferAttribute(this.positions, 3);
  private cursor = 0;
  private count = 0;
  private lastSampleTime = Number.NEGATIVE_INFINITY;

  constructor(
    color: string,
    private readonly sampleInterval: number,
  ) {
    const geometry = new BufferGeometry();
    this.positionAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.positionAttribute);
    geometry.setDrawRange(0, 0);

    const material = new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this.line = new Line(geometry, material);
    this.line.frustumCulled = false;
  }

  sample(x: number, y: number, z: number, time: number): void {
    if (time < this.lastSampleTime) {
      this.clear();
    }

    if (time - this.lastSampleTime < this.sampleInterval) {
      return;
    }

    this.writePoint(this.cursor, x, y, z);
    this.writePoint(this.cursor + TRAIL_POINT_CAPACITY, x, y, z);
    this.cursor = (this.cursor + 1) % TRAIL_POINT_CAPACITY;
    this.count = Math.min(this.count + 1, TRAIL_POINT_CAPACITY);
    this.lastSampleTime = time;

    const start = this.count < TRAIL_POINT_CAPACITY ? 0 : this.cursor;
    this.line.geometry.setDrawRange(start, this.count);
    this.positionAttribute.needsUpdate = true;
  }

  clear(): void {
    this.cursor = 0;
    this.count = 0;
    this.lastSampleTime = Number.NEGATIVE_INFINITY;
    this.line.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as LineBasicMaterial).dispose();
  }

  private writePoint(index: number, x: number, y: number, z: number): void {
    const offset = index * 3;
    this.positions[offset] = x;
    this.positions[offset + 1] = y;
    this.positions[offset + 2] = z;
  }
}

export class OrbitalRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.01, 250);
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly transform = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private readonly starField: Points;
  private quality: QualityLevel = 'balanced';
  private bodies: readonly BodyMetadata[] = [];
  private bodyMesh: InstancedMesh | undefined;
  private glowMesh: InstancedMesh | undefined;
  private trails: BodyTrail[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = 'srgb';

    this.camera.position.set(0, -7, 6);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 80;
    this.controls.target.set(0, 0, 0);

    this.starField = this.createStarField();
    this.scene.add(this.starField);
    this.scene.add(this.createReferenceGrid());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.setQuality(this.quality);
    this.resize();
  }

  setBodies(
    bodies: readonly BodyMetadata[],
    positions: Float32Array,
    cameraDistance: number,
    trailSpan: number,
  ): void {
    this.disposeBodies();
    this.bodies = bodies;

    const geometry = new SphereGeometry(1, 20, 12);
    const bodyMaterial = new MeshBasicMaterial({ vertexColors: true });
    const glowMaterial = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.1,
      side: BackSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this.bodyMesh = new InstancedMesh(geometry, bodyMaterial, bodies.length);
    this.glowMesh = new InstancedMesh(geometry.clone(), glowMaterial, bodies.length);
    this.bodyMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.glowMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.bodyMesh.frustumCulled = false;
    this.glowMesh.frustumCulled = false;

    const sampleInterval = Math.max(trailSpan / TRAIL_POINT_CAPACITY, 0.002);
    this.trails = bodies.map((body) => {
      const trail = new BodyTrail(body.color, sampleInterval);
      this.scene.add(trail.line);
      return trail;
    });

    bodies.forEach((body, index) => {
      this.color.set(body.color);
      this.bodyMesh?.setColorAt(index, this.color);
      this.glowMesh?.setColorAt(index, this.color);
    });

    this.scene.add(this.glowMesh);
    this.scene.add(this.bodyMesh);
    this.focus(cameraDistance);
    this.update(positions, 0);
  }

  update(positions: Float32Array, time: number): void {
    if (this.bodyMesh === undefined || this.glowMesh === undefined) {
      return;
    }

    for (let bodyIndex = 0; bodyIndex < this.bodies.length; bodyIndex += 1) {
      const offset = bodyIndex * 3;
      const x = positions[offset] ?? 0;
      const y = positions[offset + 1] ?? 0;
      const z = positions[offset + 2] ?? 0;
      const radius = this.bodies[bodyIndex]?.radius ?? 0.05;

      this.position.set(x, y, z);
      this.scale.setScalar(radius);
      this.transform.compose(this.position, this.bodyMesh.quaternion, this.scale);
      this.bodyMesh.setMatrixAt(bodyIndex, this.transform);

      this.scale.setScalar(radius * 1.8);
      this.transform.compose(this.position, this.glowMesh.quaternion, this.scale);
      this.glowMesh.setMatrixAt(bodyIndex, this.transform);
      this.trails[bodyIndex]?.sample(x, y, z, time);
    }

    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.glowMesh.instanceMatrix.needsUpdate = true;
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    const profile = QUALITY_PROFILES[quality];
    const devicePixelRatio = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, profile.maximumPixelRatio));
    this.starField.geometry.setDrawRange(0, profile.starCount);
    this.resize();
  }

  focus(distance: number): void {
    this.camera.position.set(0, -distance * 0.72, distance * 0.7);
    this.camera.near = Math.max(distance / 10_000, 0.001);
    this.camera.far = Math.max(distance * 20, 100);
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.disposeBodies();
    this.starField.geometry.dispose();
    (this.starField.material as PointsMaterial).dispose();
    this.renderer.dispose();
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    const width = Math.max(parent?.clientWidth ?? this.canvas.clientWidth, 1);
    const height = Math.max(parent?.clientHeight ?? this.canvas.clientHeight, 1);

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private disposeBodies(): void {
    if (this.bodyMesh !== undefined) {
      this.scene.remove(this.bodyMesh);
      this.bodyMesh.geometry.dispose();
      (this.bodyMesh.material as MeshBasicMaterial).dispose();
      this.bodyMesh = undefined;
    }

    if (this.glowMesh !== undefined) {
      this.scene.remove(this.glowMesh);
      this.glowMesh.geometry.dispose();
      (this.glowMesh.material as MeshBasicMaterial).dispose();
      this.glowMesh = undefined;
    }

    for (const trail of this.trails) {
      this.scene.remove(trail.line);
      trail.dispose();
    }

    this.trails = [];
  }

  private createReferenceGrid(): GridHelper {
    const grid = new GridHelper(40, 40, 0x285077, 0x16263a);
    grid.rotation.x = Math.PI / 2;
    const material = grid.material as LineBasicMaterial;
    material.transparent = true;
    material.opacity = 0.22;
    material.depthWrite = false;
    return grid;
  }

  private createStarField(): Points {
    const positions = new Float32Array(MAXIMUM_STARS * 3);
    let seed = 0x4f726269;

    const random = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4_294_967_296;
    };

    for (let index = 0; index < MAXIMUM_STARS; index += 1) {
      const longitude = random() * Math.PI * 2;
      const latitude = Math.acos(2 * random() - 1);
      const radius = 45 + random() * 45;
      const offset = index * 3;
      positions[offset] = radius * Math.sin(latitude) * Math.cos(longitude);
      positions[offset + 1] = radius * Math.sin(latitude) * Math.sin(longitude);
      positions[offset + 2] = radius * Math.cos(latitude);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: 0xb9d7ff,
      size: 0.08,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });

    return new Points(geometry, material);
  }
}
