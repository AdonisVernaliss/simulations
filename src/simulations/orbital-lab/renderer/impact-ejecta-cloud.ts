import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

import type { CollisionEvent } from '../model/types';
import type { QualityLevel } from './orbital-renderer';

const PARTICLE_CAPACITY = 320;
const PARTICLE_COUNTS: Record<QualityLevel, number> = {
  low: 96,
  balanced: 180,
  high: PARTICLE_CAPACITY,
};
const CLOUD_LIFETIME_SECONDS = 5.5;

const VERTEX_SHADER = `
  attribute vec3 aVelocity;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  uniform float uAge;
  uniform float uViewportHeight;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    float travelTime = (1.0 - exp(-uAge * 0.82)) / 0.82;
    vec3 particlePosition = position + aVelocity * travelTime;
    vec4 viewPosition = modelViewMatrix * vec4(particlePosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * uViewportHeight / max(-viewPosition.z, 0.12), 1.0, 18.0);
    vColor = aColor;
    vSeed = aSeed;
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform float uAge;
  uniform float uLifetime;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float radius = length(centered) * 2.0;
    if (radius >= 1.0) discard;
    float core = 1.0 - smoothstep(0.12, 1.0, radius);
    float ageFade = 1.0 - smoothstep(uLifetime * (0.62 + vSeed * 0.18), uLifetime, uAge);
    float hotFade = exp(-uAge * (0.72 + vSeed * 0.4));
    vec3 cooled = mix(vColor, vec3(0.28, 0.24, 0.22), 1.0 - hotFade);
    gl_FragColor = vec4(cooled, core * ageFade * (0.36 + hotFade * 0.64));
  }
`;

const pseudoRandom = (index: number, channel: number): number => {
  const value = Math.sin((index + 1) * 91.17 + channel * 37.31) * 43_758.5453;
  return value - Math.floor(value);
};

export class ImpactEjectaCloud {
  readonly points: Points<BufferGeometry, ShaderMaterial>;

  private readonly positions = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly velocities = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly colors = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly sizes = new Float32Array(PARTICLE_CAPACITY);
  private readonly seeds = new Float32Array(PARTICLE_CAPACITY);
  private readonly normal = new Vector3();
  private readonly tangent = new Vector3();
  private readonly bitangent = new Vector3();
  private readonly direction = new Vector3();
  private readonly color = new Color();
  private age = CLOUD_LIFETIME_SECONDS;
  private quality: QualityLevel = 'balanced';

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aVelocity', new BufferAttribute(this.velocities, 3));
    geometry.setAttribute('aColor', new BufferAttribute(this.colors, 3));
    geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1));
    geometry.setAttribute('aSeed', new BufferAttribute(this.seeds, 1));
    geometry.setDrawRange(0, PARTICLE_COUNTS[this.quality]);

    const material = new ShaderMaterial({
      uniforms: {
        uAge: { value: this.age },
        uLifetime: { value: CLOUD_LIFETIME_SECONDS },
        uViewportHeight: { value: 1 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });

    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 4;
  }

  show(event: CollisionEvent): void {
    if (event.outcome === 'capture' || event.outcome === 'black-hole-merger') {
      this.clear();
      return;
    }

    this.points.position.fromArray(event.position);
    this.normal.fromArray(event.normal).normalize();
    this.tangent
      .crossVectors(this.normal, Math.abs(this.normal.y) < 0.9 ? ImpactEjectaCloud.UP : ImpactEjectaCloud.RIGHT)
      .normalize();
    this.bitangent.crossVectors(this.normal, this.tangent).normalize();
    const speedRatio = Math.min(
      3,
      event.ejectaSpeed / Math.max(event.mutualEscapeSpeed, Number.EPSILON),
    );
    const plumeSpeed = event.visualRadius * (0.32 + speedRatio * 0.38);

    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      const angle = pseudoRandom(index, 0) * Math.PI * 2;
      const radialWeight = 0.68 + pseudoRandom(index, 1) * 0.48;
      const axialWeight = (pseudoRandom(index, 2) - 0.5) * 0.72;
      this.direction
        .copy(this.tangent)
        .multiplyScalar(Math.cos(angle) * radialWeight)
        .addScaledVector(this.bitangent, Math.sin(angle) * radialWeight)
        .addScaledVector(this.normal, axialWeight)
        .normalize();
      const offset = index * 3;
      const originRadius = event.visualRadius * pseudoRandom(index, 3) * 0.18;
      this.positions[offset] = this.direction.x * originRadius;
      this.positions[offset + 1] = this.direction.y * originRadius;
      this.positions[offset + 2] = this.direction.z * originRadius;
      const speed = plumeSpeed * (0.42 + pseudoRandom(index, 4) * 1.18);
      this.velocities[offset] = this.direction.x * speed;
      this.velocities[offset + 1] = this.direction.y * speed;
      this.velocities[offset + 2] = this.direction.z * speed;
      this.color.setHSL(
        0.035 + pseudoRandom(index, 5) * 0.085,
        0.38 + pseudoRandom(index, 6) * 0.48,
        0.42 + pseudoRandom(index, 7) * 0.36,
      );
      this.colors[offset] = this.color.r;
      this.colors[offset + 1] = this.color.g;
      this.colors[offset + 2] = this.color.b;
      this.sizes[index] = event.visualRadius * (0.035 + pseudoRandom(index, 8) * 0.11);
      this.seeds[index] = pseudoRandom(index, 9);
    }

    for (const attributeName of ['position', 'aVelocity', 'aColor', 'aSize', 'aSeed']) {
      this.points.geometry.getAttribute(attributeName).needsUpdate = true;
    }
    this.age = 0;
    this.points.material.uniforms.uAge!.value = 0;
    this.points.visible = true;
  }

  update(elapsedSeconds: number, viewportHeight: number): void {
    if (!this.points.visible) return;
    this.age += elapsedSeconds;
    this.points.material.uniforms.uAge!.value = this.age;
    this.points.material.uniforms.uViewportHeight!.value = viewportHeight;
    if (this.age >= CLOUD_LIFETIME_SECONDS) {
      this.points.visible = false;
    }
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    this.points.geometry.setDrawRange(0, PARTICLE_COUNTS[quality]);
  }

  clear(): void {
    this.age = CLOUD_LIFETIME_SECONDS;
    this.points.visible = false;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }

  private static readonly UP = new Vector3(0, 1, 0);
  private static readonly RIGHT = new Vector3(1, 0, 0);
}
