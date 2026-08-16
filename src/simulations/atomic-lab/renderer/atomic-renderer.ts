import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { HydrogenState } from '../model/hydrogen';
import { sampleOrbital } from '../model/orbital-sampler';

export type AtomicQuality = 'low' | 'balanced' | 'high';

interface AtomicQualityProfile {
  readonly pointCount: number;
  readonly maximumPixelRatio: number;
}

const QUALITY_PROFILES: Record<AtomicQuality, AtomicQualityProfile> = {
  low: { pointCount: 10_000, maximumPixelRatio: 1 },
  balanced: { pointCount: 24_000, maximumPixelRatio: 1.5 },
  high: { pointCount: 42_000, maximumPixelRatio: 2 },
};

const MAXIMUM_POINT_COUNT = QUALITY_PROFILES.high.pointCount;
const POSITIVE_PHASE = new Color(0x62d8ff);
const NEGATIVE_PHASE = new Color(0xff9b63);
const UNIFORM_PHASE = new Color(0xa8dcff);

export class AtomicRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(40, 1, 0.01, 500);
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly orbitalGroup = new Group();
  private readonly guideGroup = new Group();
  private readonly nucleus: Mesh;
  private readonly nucleusGlow: Mesh;
  private orbital: Points | undefined;
  private phases: Int8Array<ArrayBufferLike> = new Int8Array();
  private quality: AtomicQuality = 'balanced';
  private phaseVisible = true;
  private rotating = true;
  private lastTimestamp = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.camera.position.set(0, -12, 7);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 130;

    const nucleusGeometry = new SphereGeometry(1, 20, 14);
    this.nucleus = new Mesh(
      nucleusGeometry,
      new MeshBasicMaterial({ color: 0xffe1a3, toneMapped: false }),
    );
    this.nucleusGlow = new Mesh(
      nucleusGeometry.clone(),
      new MeshBasicMaterial({
        color: 0xffb85c,
        transparent: true,
        opacity: 0.14,
        side: BackSide,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.nucleusGlow.scale.setScalar(2.8);

    this.scene.add(this.guideGroup, this.orbitalGroup, this.nucleusGlow, this.nucleus);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.setQuality(this.quality);
    this.resize();
  }

  setState(state: HydrogenState): void {
    this.disposeOrbital();
    const sample = sampleOrbital(state, MAXIMUM_POINT_COUNT, this.hashStateId(state.id));
    this.phases = sample.phases;

    const geometry = new BufferGeometry();
    const positionAttribute = new BufferAttribute(sample.positions, 3);
    positionAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('color', new BufferAttribute(this.createColors(sample.phases), 3));
    geometry.setDrawRange(0, QUALITY_PROFILES[this.quality].pointCount);

    const material = new PointsMaterial({
      vertexColors: true,
      size: Math.max(state.extent * 0.0065, 0.045),
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });

    this.orbital = new Points(geometry, material);
    this.orbital.frustumCulled = false;
    this.orbitalGroup.add(this.orbital);
    this.updateGuides(state);

    const markerRadius = Math.max(state.extent * 0.008, 0.07);
    this.nucleus.scale.setScalar(markerRadius);
    this.nucleusGlow.scale.setScalar(markerRadius * 2.8);
    this.focus(state.extent);
  }

  setQuality(quality: AtomicQuality): void {
    this.quality = quality;
    const profile = QUALITY_PROFILES[quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maximumPixelRatio));
    this.orbital?.geometry.setDrawRange(0, profile.pointCount);
    this.resize();
  }

  setPhaseVisible(visible: boolean): void {
    this.phaseVisible = visible;
    if (this.orbital === undefined) {
      return;
    }

    const colorAttribute = this.orbital.geometry.getAttribute('color') as BufferAttribute;
    colorAttribute.copyArray(this.createColors(this.phases));
    colorAttribute.needsUpdate = true;
  }

  setRotating(rotating: boolean): void {
    this.rotating = rotating;
  }

  render(timestamp: number): void {
    const elapsed = Math.min((timestamp - this.lastTimestamp) / 1_000, 0.1);
    this.lastTimestamp = timestamp;
    if (this.rotating) {
      this.orbitalGroup.rotation.z += elapsed * 0.055;
      this.guideGroup.rotation.z = this.orbitalGroup.rotation.z;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.disposeOrbital();
    this.disposeGuides();
    this.nucleus.geometry.dispose();
    (this.nucleus.material as MeshBasicMaterial).dispose();
    this.nucleusGlow.geometry.dispose();
    (this.nucleusGlow.material as MeshBasicMaterial).dispose();
    this.renderer.dispose();
  }

  private focus(extent: number): void {
    const distance = extent * 1.28;
    this.camera.position.set(distance * 0.4, -distance, distance * 0.58);
    this.camera.near = Math.max(extent / 10_000, 0.001);
    this.camera.far = Math.max(extent * 12, 100);
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = Math.max(extent * 0.08, 0.7);
    this.controls.maxDistance = extent * 5;
    this.controls.update();
  }

  private createColors(phases: Int8Array): Float32Array {
    const colors = new Float32Array(phases.length * 3);
    for (let index = 0; index < phases.length; index += 1) {
      const color = this.phaseVisible
        ? (phases[index] ?? 1) < 0
          ? NEGATIVE_PHASE
          : POSITIVE_PHASE
        : UNIFORM_PHASE;
      color.toArray(colors, index * 3);
    }
    return colors;
  }

  private updateGuides(state: HydrogenState): void {
    this.disposeGuides();
    const radii = [1, state.n * state.n, state.extent * 0.72];
    const rotations: ReadonlyArray<readonly [number, number, number]> = [
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
      [0, Math.PI / 2, 0],
    ];

    radii.forEach((radius, radiusIndex) => {
      for (const rotation of rotations) {
        const positions = new Float32Array(128 * 3);
        for (let index = 0; index < 128; index += 1) {
          const angle = (index / 128) * Math.PI * 2;
          positions[index * 3] = Math.cos(angle) * radius;
          positions[index * 3 + 1] = Math.sin(angle) * radius;
        }
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new BufferAttribute(positions, 3));
        const line = new LineLoop(
          geometry,
          new LineBasicMaterial({
            color: radiusIndex === 0 ? 0x4e89aa : 0x31546c,
            transparent: true,
            opacity: radiusIndex === 0 ? 0.24 : 0.1,
            depthWrite: false,
          }),
        );
        line.rotation.set(...rotation);
        this.guideGroup.add(line);
      }
    });
  }

  private disposeOrbital(): void {
    if (this.orbital === undefined) {
      return;
    }
    this.orbitalGroup.remove(this.orbital);
    this.orbital.geometry.dispose();
    (this.orbital.material as PointsMaterial).dispose();
    this.orbital = undefined;
    this.phases = new Int8Array();
  }

  private disposeGuides(): void {
    for (const child of [...this.guideGroup.children]) {
      const line = child as LineLoop;
      this.guideGroup.remove(line);
      line.geometry.dispose();
      (line.material as LineBasicMaterial).dispose();
    }
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    const width = Math.max(parent?.clientWidth ?? this.canvas.clientWidth, 1);
    const height = Math.max(parent?.clientHeight ?? this.canvas.clientHeight, 1);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private hashStateId(id: string): number {
    let hash = 2_166_136_261;
    for (const character of id) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16_777_619);
    }
    return hash >>> 0;
  }
}
