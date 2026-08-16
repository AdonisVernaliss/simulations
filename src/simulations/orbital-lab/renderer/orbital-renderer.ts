import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  GridHelper,
  InstancedBufferAttribute,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { BodyMetadata } from '../worker-protocol';

export type QualityLevel = 'low' | 'balanced' | 'high';

export interface BodySelection {
  readonly body: BodyMetadata;
  readonly index: number;
}

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
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly focusTarget = new Vector3();
  private readonly focusDirection = new Vector3();
  private readonly starField: Points;
  private readonly glowTexture: CanvasTexture;
  private readonly selectionRing: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly primaryLight = new PointLight(0xffffff, 18, 0, 1.5);
  private quality: QualityLevel = 'balanced';
  private bodies: readonly BodyMetadata[] = [];
  private bodyMesh: InstancedMesh | undefined;
  private glowMesh: InstancedMesh | undefined;
  private starGlows: Array<{ readonly bodyIndex: number; readonly sprite: Sprite }> = [];
  private planetaryRings: Array<{ readonly bodyIndex: number; readonly mesh: Mesh }> = [];
  private trails: BodyTrail[] = [];
  private velocityVectors: LineSegments | undefined;
  private previousPositions = new Float32Array();
  private previousTime = 0;
  private velocityScale = 0.1;
  private velocityVectorsVisible = false;
  private selectedBodyIndex: number | undefined;
  private followedBodyIndex: number | undefined;
  private focusDistance = 1;
  private focusInProgress = false;
  private systemCameraDistance = 10;
  private pointerDownX = 0;
  private pointerDownY = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onBodySelected: (selection: BodySelection | undefined) => void = () => {},
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.camera.position.set(0, -7, 6);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 80;
    this.controls.target.set(0, 0, 0);

    this.glowTexture = this.createGlowTexture();
    this.starField = this.createStarField();
    this.selectionRing = this.createSelectionRing();
    this.scene.add(this.starField);
    this.scene.add(new AmbientLight(0x8ba8c9, 1.55));
    this.scene.add(this.primaryLight);
    this.scene.add(this.createReferenceGrid());
    this.scene.add(this.selectionRing);

    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);

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
    this.systemCameraDistance = cameraDistance;
    this.selectedBodyIndex = undefined;
    this.followedBodyIndex = undefined;
    this.selectionRing.visible = false;
    this.onBodySelected(undefined);

    const geometry = new SphereGeometry(1, 28, 18);
    const bodyMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: false,
      roughness: 0.72,
      metalness: 0.02,
    });
    const glowMaterial = new MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: false,
      transparent: true,
      opacity: 0.1,
      side: BackSide,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
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
    this.velocityVectors = this.createVelocityVectors(bodies);
    this.velocityVectors.visible = this.velocityVectorsVisible;
    this.scene.add(this.velocityVectors);
    this.createBodyAccents(bodies);
    this.previousPositions = new Float32Array(positions);
    this.previousTime = 0;
    this.velocityScale = cameraDistance * 0.032;

    const instanceColors = new Float32Array(bodies.length * 3);
    bodies.forEach((body, index) => {
      this.color.set(body.color);
      this.color.toArray(instanceColors, index * 3);
    });
    this.bodyMesh.instanceColor = new InstancedBufferAttribute(instanceColors, 3);
    this.glowMesh.instanceColor = new InstancedBufferAttribute(instanceColors.slice(), 3);

    this.scene.add(this.glowMesh);
    this.scene.add(this.bodyMesh);
    this.focus(cameraDistance);
    this.update(positions, 0);
  }

  update(positions: Float32Array, time: number): void {
    if (this.bodyMesh === undefined || this.glowMesh === undefined) {
      return;
    }

    this.updateVelocityVectors(positions, time);

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

    for (const { bodyIndex, sprite } of this.starGlows) {
      const offset = bodyIndex * 3;
      sprite.position.fromArray(positions, offset);
    }

    for (const { bodyIndex, mesh } of this.planetaryRings) {
      const offset = bodyIndex * 3;
      mesh.position.fromArray(positions, offset);
    }

    const primaryBodyIndex = this.getPrimaryBodyIndex();
    if (primaryBodyIndex !== undefined) {
      this.primaryLight.position.fromArray(positions, primaryBodyIndex * 3);
      this.primaryLight.color.set(this.bodies[primaryBodyIndex]?.color ?? 0xffffff);
    }

    this.updateSelectionRing(positions);

    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.glowMesh.instanceMatrix.needsUpdate = true;
    this.previousPositions.set(positions);
    this.previousTime = time;
  }

  render(): void {
    this.animateFocus();
    if (this.selectionRing.visible) {
      this.selectionRing.lookAt(this.camera.position);
    }
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

  setVelocityVectorsVisible(visible: boolean): void {
    this.velocityVectorsVisible = visible;
    if (this.velocityVectors !== undefined) {
      this.velocityVectors.visible = visible;
    }
  }

  selectBody(index: number | undefined): void {
    if (index === undefined || this.bodies[index] === undefined) {
      this.selectedBodyIndex = undefined;
      this.followedBodyIndex = undefined;
      this.focusInProgress = false;
      this.selectionRing.visible = false;
      this.onBodySelected(undefined);
      return;
    }

    this.selectedBodyIndex = index;
    this.selectionRing.visible = true;
    this.onBodySelected({ body: this.bodies[index], index });
    this.updateSelectionRing(this.previousPositions);
  }

  focusBody(index: number): void {
    const body = this.bodies[index];
    if (body === undefined) {
      return;
    }

    this.selectBody(index);
    this.followedBodyIndex = index;
    this.focusDistance = Math.max(body.radius * 10, this.systemCameraDistance * 0.025, 0.42);
    this.focusInProgress = true;
  }

  focusSystem(): void {
    this.selectBody(undefined);
    this.focus(this.systemCameraDistance);
  }

  focus(distance: number): void {
    this.followedBodyIndex = undefined;
    this.focusInProgress = false;
    this.camera.position.set(0, -distance * 0.72, distance * 0.7);
    this.camera.near = Math.max(distance / 10_000, 0.001);
    this.camera.far = Math.max(distance * 20, 100);
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.controls.dispose();
    this.disposeBodies();
    this.starField.geometry.dispose();
    (this.starField.material as PointsMaterial).dispose();
    this.selectionRing.geometry.dispose();
    this.selectionRing.material.dispose();
    this.glowTexture.dispose();
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
      (this.bodyMesh.material as MeshStandardMaterial).dispose();
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

    for (const { sprite } of this.starGlows) {
      this.scene.remove(sprite);
      (sprite.material as SpriteMaterial).dispose();
    }
    this.starGlows = [];

    for (const { mesh } of this.planetaryRings) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
    }
    this.planetaryRings = [];

    if (this.velocityVectors !== undefined) {
      this.scene.remove(this.velocityVectors);
      this.velocityVectors.geometry.dispose();
      (this.velocityVectors.material as LineBasicMaterial).dispose();
      this.velocityVectors = undefined;
    }

    this.previousPositions = new Float32Array();
    this.previousTime = 0;
  }

  private createReferenceGrid(): GridHelper {
    const grid = new GridHelper(40, 40, 0x285077, 0x16263a);
    grid.rotation.x = Math.PI / 2;
    const material = grid.material as LineBasicMaterial;
    material.transparent = true;
    material.opacity = 0.08;
    material.depthWrite = false;
    return grid;
  }

  private createStarField(): Points {
    const positions = new Float32Array(MAXIMUM_STARS * 3);
    const colors = new Float32Array(MAXIMUM_STARS * 3);
    let seed = 0x4f726269;

    const random = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4_294_967_296;
    };

    for (let index = 0; index < MAXIMUM_STARS; index += 1) {
      const longitude = random() * Math.PI * 2;
      const isGalacticBand = index < MAXIMUM_STARS * 0.38;
      const zDistribution = isGalacticBand
        ? Math.max(-1, Math.min(1, (random() + random() + random() - 1.5) * 0.22))
        : 2 * random() - 1;
      const latitude = Math.acos(zDistribution);
      const radius = 52 + random() * 42;
      const offset = index * 3;
      positions[offset] = radius * Math.sin(latitude) * Math.cos(longitude);
      positions[offset + 1] = radius * Math.sin(latitude) * Math.sin(longitude);
      positions[offset + 2] = radius * Math.cos(latitude);

      const warmth = random();
      this.color.set(warmth > 0.82 ? 0xffd3a1 : warmth < 0.2 ? 0xa9ccff : 0xe7f1ff);
      this.color.multiplyScalar(0.55 + random() * 0.45);
      this.color.toArray(colors, offset);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      vertexColors: true,
      size: 0.095,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      toneMapped: false,
    });

    return new Points(geometry, material);
  }

  private createSelectionRing(): Mesh<RingGeometry, MeshBasicMaterial> {
    const geometry = new RingGeometry(1.28, 1.42, 64);
    const material = new MeshBasicMaterial({
      color: 0x78d9ff,
      transparent: true,
      opacity: 0.72,
      side: DoubleSide,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    const ring = new Mesh(geometry, material);
    ring.visible = false;
    ring.renderOrder = 5;
    return ring;
  }

  private createGlowTexture(): CanvasTexture {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 128;
    textureCanvas.height = 128;
    const context = textureCanvas.getContext('2d');

    if (context !== null) {
      const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.12, 'rgba(255, 255, 255, 0.9)');
      gradient.addColorStop(0.38, 'rgba(255, 255, 255, 0.28)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }

    const texture = new CanvasTexture(textureCanvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  private createBodyAccents(bodies: readonly BodyMetadata[]): void {
    bodies.forEach((body, bodyIndex) => {
      if (body.radius >= 0.14) {
        const sprite = new Sprite(
          new SpriteMaterial({
            map: this.glowTexture,
            color: body.color,
            transparent: true,
            opacity: 0.72,
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        const glowSize = body.radius * 6.2;
        sprite.scale.set(glowSize, glowSize, 1);
        sprite.renderOrder = -1;
        this.starGlows.push({ bodyIndex, sprite });
        this.scene.add(sprite);
      }

      if (/saturn/i.test(`${body.id} ${body.name}`)) {
        const geometry = new RingGeometry(body.radius * 1.45, body.radius * 2.35, 72);
        const material = new MeshBasicMaterial({
          color: 0xd6c39c,
          transparent: true,
          opacity: 0.66,
          side: DoubleSide,
          depthWrite: false,
        });
        const ring = new Mesh(geometry, material);
        ring.rotation.x = 0.35;
        ring.rotation.y = -0.18;
        this.planetaryRings.push({ bodyIndex, mesh: ring });
        this.scene.add(ring);
      }
    });
  }

  private updateSelectionRing(positions: Float32Array): void {
    if (this.selectedBodyIndex === undefined || !this.selectionRing.visible) {
      return;
    }

    const body = this.bodies[this.selectedBodyIndex];
    const offset = this.selectedBodyIndex * 3;
    if (body === undefined || positions.length < offset + 3) {
      return;
    }

    this.selectionRing.position.fromArray(positions, offset);
    this.selectionRing.scale.setScalar(
      Math.max(body.radius, this.systemCameraDistance * 0.0045),
    );
  }

  private animateFocus(): void {
    if (this.followedBodyIndex === undefined) {
      return;
    }

    const offset = this.followedBodyIndex * 3;
    if (this.previousPositions.length < offset + 3) {
      return;
    }

    this.focusTarget.fromArray(this.previousPositions, offset);

    if (!this.focusInProgress) {
      this.position.subVectors(this.focusTarget, this.controls.target);
      this.camera.position.add(this.position);
      this.controls.target.copy(this.focusTarget);
      return;
    }

    this.focusDirection.subVectors(this.camera.position, this.controls.target);
    if (this.focusDirection.lengthSq() < Number.EPSILON) {
      this.focusDirection.set(0, -1, 0.65);
    }
    this.focusDirection.normalize().multiplyScalar(this.focusDistance).add(this.focusTarget);
    this.camera.position.lerp(this.focusDirection, 0.095);
    this.controls.target.lerp(this.focusTarget, 0.14);

    if (
      this.camera.position.distanceTo(this.focusDirection) < this.focusDistance * 0.015 &&
      this.controls.target.distanceTo(this.focusTarget) < this.focusDistance * 0.01
    ) {
      this.focusInProgress = false;
    }
  }

  private getPrimaryBodyIndex(): number | undefined {
    if (this.bodies.length === 0) {
      return undefined;
    }

    let primaryBodyIndex = 0;
    for (let bodyIndex = 1; bodyIndex < this.bodies.length; bodyIndex += 1) {
      if ((this.bodies[bodyIndex]?.mass ?? 0) > (this.bodies[primaryBodyIndex]?.mass ?? 0)) {
        primaryBodyIndex = bodyIndex;
      }
    }
    return primaryBodyIndex;
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (
      Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY) > 6 ||
      this.bodyMesh === undefined
    ) {
      return;
    }

    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObject(this.bodyMesh, false);
    const bodyIndex = intersections[0]?.instanceId;
    this.selectBody(bodyIndex);
  };

  private createVelocityVectors(bodies: readonly BodyMetadata[]): LineSegments {
    const positions = new Float32Array(bodies.length * 2 * 3);
    const colors = new Float32Array(bodies.length * 2 * 3);

    bodies.forEach((body, bodyIndex) => {
      this.color.set(body.color);
      this.color.toArray(colors, bodyIndex * 6);
      this.color.lerp(new Color(0xffffff), 0.48);
      this.color.toArray(colors, bodyIndex * 6 + 3);
    });

    const geometry = new BufferGeometry();
    const positionAttribute = new BufferAttribute(positions, 3);
    positionAttribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('color', new BufferAttribute(colors, 3));

    const material = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    const vectors = new LineSegments(geometry, material);
    vectors.frustumCulled = false;
    return vectors;
  }

  private updateVelocityVectors(positions: Float32Array, time: number): void {
    if (
      this.velocityVectors === undefined ||
      positions.length !== this.previousPositions.length ||
      time <= this.previousTime
    ) {
      return;
    }

    const elapsedTime = time - this.previousTime;
    const attribute = this.velocityVectors.geometry.getAttribute('position') as BufferAttribute;
    const vectorPositions = attribute.array as Float32Array;

    for (let bodyIndex = 0; bodyIndex < this.bodies.length; bodyIndex += 1) {
      const sourceOffset = bodyIndex * 3;
      const vectorOffset = bodyIndex * 6;

      for (let component = 0; component < 3; component += 1) {
        const position = positions[sourceOffset + component] ?? 0;
        const previousPosition = this.previousPositions[sourceOffset + component] ?? position;
        vectorPositions[vectorOffset + component] = position;
        vectorPositions[vectorOffset + component + 3] =
          position + ((position - previousPosition) / elapsedTime) * this.velocityScale;
      }
    }

    attribute.needsUpdate = true;
  }
}
