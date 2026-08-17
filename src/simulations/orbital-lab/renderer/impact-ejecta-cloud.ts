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

const PARTICLE_CAPACITY = 640;
const PARTICLE_COUNTS: Record<QualityLevel, number> = {
  low: 128,
  balanced: 320,
  high: PARTICLE_CAPACITY,
};

const VERTEX_SHADER = `
  attribute vec3 aVelocity;
  attribute vec3 aAcceleration;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  uniform float uAge;
  uniform float uMode;
  uniform float uViewportHeight;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    float dragTime = (1.0 - exp(-uAge * 0.76)) / 0.76;
    float ballisticTime = uAge / (1.0 + uAge * 0.14);
    float travelTime = mix(dragTime, ballisticTime, step(0.5, uMode));
    vec3 particlePosition = position + aVelocity * travelTime +
      0.5 * aAcceleration * travelTime * travelTime;
    vec4 viewPosition = modelViewMatrix * vec4(particlePosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * uViewportHeight / max(-viewPosition.z, 0.12), 1.0, 26.0);
    vColor = aColor;
    vSeed = aSeed;
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;
  uniform float uAge;
  uniform float uLifetime;
  uniform float uMode;
  varying vec3 vColor;
  varying float vSeed;

  void main() {
    vec2 centered = gl_PointCoord - 0.5;
    float radius = length(centered) * 2.0;
    if (radius >= 1.0) discard;
    float core = 1.0 - smoothstep(0.08, 1.0, radius);
    float ageFade = 1.0 - smoothstep(uLifetime * (0.58 + vSeed * 0.2), uLifetime, uAge);
    float hotFade = exp(-uAge * (0.42 + vSeed * 0.38));
    vec3 planetDust = vec3(0.2, 0.16, 0.13);
    vec3 stellarDust = vec3(0.28, 0.075, 0.026);
    vec3 streamGas = vec3(0.22, 0.055, 0.018);
    vec3 coolTarget = uMode < 0.5
      ? planetDust
      : (uMode < 1.5 ? stellarDust : streamGas);
    vec3 cooled = mix(vColor, coolTarget, 1.0 - hotFade);
    float emission = mix(0.42, 0.82, step(0.5, uMode));
    gl_FragColor = vec4(cooled * (0.72 + hotFade * emission), core * ageFade * (0.3 + hotFade * 0.7));
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
  private readonly accelerations = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly colors = new Float32Array(PARTICLE_CAPACITY * 3);
  private readonly sizes = new Float32Array(PARTICLE_CAPACITY);
  private readonly seeds = new Float32Array(PARTICLE_CAPACITY);
  private readonly radial = new Vector3();
  private readonly tangent = new Vector3();
  private readonly orbitalNormal = new Vector3();
  private readonly direction = new Vector3();
  private readonly azimuthal = new Vector3();
  private readonly color = new Color();
  private readonly secondaryColor = new Color();
  private age = Number.POSITIVE_INFINITY;
  private lifetime = 5.5;
  private quality: QualityLevel = 'balanced';

  constructor() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aVelocity', new BufferAttribute(this.velocities, 3));
    geometry.setAttribute('aAcceleration', new BufferAttribute(this.accelerations, 3));
    geometry.setAttribute('aColor', new BufferAttribute(this.colors, 3));
    geometry.setAttribute('aSize', new BufferAttribute(this.sizes, 1));
    geometry.setAttribute('aSeed', new BufferAttribute(this.seeds, 1));
    geometry.setDrawRange(0, PARTICLE_COUNTS[this.quality]);

    const material = new ShaderMaterial({
      uniforms: {
        uAge: { value: this.age },
        uLifetime: { value: this.lifetime },
        uMode: { value: 0 },
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
    if (
      event.visualClass === 'compact-merger' &&
      event.participantKinds.every((kind) => kind === 'black-hole')
    ) {
      this.clear();
      return;
    }

    this.setEncounterBasis(event);
    this.points.position.fromArray(event.position);

    switch (event.visualClass) {
      case 'stellar-merger':
        this.fillStellarMerger(event, false);
        break;
      case 'compact-merger':
        this.fillStellarMerger(event, true);
        break;
      case 'tidal-disruption':
      case 'horizon-capture':
        this.fillTidalStream(event);
        break;
      default:
        this.fillPlanetaryImpact(event);
        break;
    }

    for (const attributeName of [
      'position',
      'aVelocity',
      'aAcceleration',
      'aColor',
      'aSize',
      'aSeed',
    ]) {
      this.points.geometry.getAttribute(attributeName).needsUpdate = true;
    }
    this.age = 0;
    this.points.material.uniforms.uAge!.value = 0;
    this.points.material.uniforms.uLifetime!.value = this.lifetime;
    this.points.visible = true;
  }

  update(elapsedSeconds: number, viewportHeight: number): void {
    if (!this.points.visible) return;
    this.age += elapsedSeconds;
    this.points.material.uniforms.uAge!.value = this.age;
    this.points.material.uniforms.uViewportHeight!.value = viewportHeight;
    if (this.age >= this.lifetime) this.points.visible = false;
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    this.points.geometry.setDrawRange(0, PARTICLE_COUNTS[quality]);
  }

  clear(): void {
    this.age = Number.POSITIVE_INFINITY;
    this.points.visible = false;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }

  private setEncounterBasis(event: CollisionEvent): void {
    this.radial.fromArray(event.normal).normalize();
    this.tangent.fromArray(event.relativeVelocity);
    this.tangent.addScaledVector(this.radial, -this.tangent.dot(this.radial));
    if (this.tangent.lengthSq() < 1e-8) {
      this.tangent
        .crossVectors(
          this.radial,
          Math.abs(this.radial.y) < 0.9 ? ImpactEjectaCloud.UP : ImpactEjectaCloud.RIGHT,
        );
    }
    this.tangent.normalize();
    this.orbitalNormal.crossVectors(this.radial, this.tangent).normalize();
  }

  private fillPlanetaryImpact(event: CollisionEvent): void {
    this.lifetime = 6.4;
    this.points.material.uniforms.uMode!.value = 0;
    const speedRatio = Math.min(
      3,
      event.ejectaSpeed / Math.max(event.mutualEscapeSpeed, Number.EPSILON),
    );
    const plumeSpeed = event.visualRadius * (0.34 + speedRatio * 0.4);

    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      const angle = pseudoRandom(index, 0) * Math.PI * 2;
      const radialWeight = 0.72 + pseudoRandom(index, 1) * 0.5;
      const axialWeight = (pseudoRandom(index, 2) - 0.5) * 0.68;
      this.direction
        .copy(this.tangent)
        .multiplyScalar(Math.cos(angle) * radialWeight)
        .addScaledVector(this.orbitalNormal, Math.sin(angle) * radialWeight)
        .addScaledVector(this.radial, axialWeight)
        .normalize();
      const originRadius = event.visualRadius * pseudoRandom(index, 3) * 0.24;
      const speed = plumeSpeed * (0.38 + pseudoRandom(index, 4) * 1.28);
      this.writeVector(this.positions, index, this.direction, originRadius);
      this.writeVector(this.velocities, index, this.direction, speed);
      this.writeVector(this.accelerations, index, this.direction, -speed * 0.09);
      this.color.setHSL(
        0.025 + pseudoRandom(index, 5) * 0.09,
        0.34 + pseudoRandom(index, 6) * 0.52,
        0.38 + pseudoRandom(index, 7) * 0.4,
      );
      this.writeColor(index, this.color);
      this.sizes[index] = event.visualRadius * (0.04 + pseudoRandom(index, 8) * 0.14);
      this.seeds[index] = pseudoRandom(index, 9);
    }
  }

  private fillStellarMerger(event: CollisionEvent, compact: boolean): void {
    this.lifetime = compact ? 7.2 : 9.5;
    this.points.material.uniforms.uMode!.value = 1;
    this.color.set(event.participantColors[0]);
    this.secondaryColor.set(event.participantColors[1]);
    const baseSpeed = event.visualRadius * (compact ? 1.15 : 0.62);

    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      const angle = pseudoRandom(index, 0) * Math.PI * 2;
      const radius = event.visualRadius * (0.08 + pseudoRandom(index, 1) * 0.58);
      const height = (pseudoRandom(index, 2) - 0.5) * event.visualRadius * 0.22;
      this.direction
        .copy(this.radial)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(this.tangent, Math.sin(angle));
      this.azimuthal
        .copy(this.radial)
        .multiplyScalar(-Math.sin(angle))
        .addScaledVector(this.tangent, Math.cos(angle));
      const offset = index * 3;
      this.positions[offset] = this.direction.x * radius + this.orbitalNormal.x * height;
      this.positions[offset + 1] = this.direction.y * radius + this.orbitalNormal.y * height;
      this.positions[offset + 2] = this.direction.z * radius + this.orbitalNormal.z * height;
      const outflow = baseSpeed * (0.24 + pseudoRandom(index, 3) * 0.92);
      const rotation = baseSpeed * (0.46 + pseudoRandom(index, 4) * 0.8);
      this.velocities[offset] = this.direction.x * outflow + this.azimuthal.x * rotation;
      this.velocities[offset + 1] = this.direction.y * outflow + this.azimuthal.y * rotation;
      this.velocities[offset + 2] = this.direction.z * outflow + this.azimuthal.z * rotation;
      this.writeVector(
        this.accelerations,
        index,
        this.direction,
        -baseSpeed * (compact ? 0.2 : 0.12),
      );
      this.color
        .set(event.participantColors[index % 2]!)
        .lerp(this.secondaryColor, pseudoRandom(index, 5) * 0.35)
        .lerp(ImpactEjectaCloud.HOT_WHITE, compact ? 0.5 : 0.28);
      this.writeColor(index, this.color);
      this.sizes[index] = event.visualRadius * (0.055 + pseudoRandom(index, 6) * 0.19);
      this.seeds[index] = pseudoRandom(index, 7);
    }
  }

  private fillTidalStream(event: CollisionEvent): void {
    this.lifetime = 10.5;
    this.points.material.uniforms.uMode!.value = 2;
    const blackHoleIndex = event.participantKinds[0] === 'black-hole' ? 0 : 1;
    const victimIndex = blackHoleIndex === 0 ? 1 : 0;
    if (blackHoleIndex === 1) {
      this.radial.multiplyScalar(-1);
      this.tangent.multiplyScalar(-1);
    }
    this.orbitalNormal.crossVectors(this.radial, this.tangent).normalize();
    const blackHoleRadius = event.participantVisualRadii[blackHoleIndex];
    const victimRadius = event.participantVisualRadii[victimIndex];
    const innerRadius = Math.max(blackHoleRadius * 2.75, event.visualRadius * 0.85);
    const streamLength = Math.max(victimRadius * 8, blackHoleRadius * 7);
    this.color.set(event.participantColors[victimIndex]);

    for (let index = 0; index < PARTICLE_CAPACITY; index += 1) {
      const seed = pseudoRandom(index, 0);
      const bound = seed < 0.64;
      const longitudinal = pseudoRandom(index, 1);
      const radius = innerRadius + streamLength * longitudinal;
      const thickness = victimRadius * (0.08 + 0.34 * (1.0 - longitudinal));
      const side = (pseudoRandom(index, 2) - 0.5) * thickness;
      const height = (pseudoRandom(index, 3) - 0.5) * thickness * 0.48;
      const offset = index * 3;
      this.positions[offset] =
        this.radial.x * radius + this.tangent.x * side + this.orbitalNormal.x * height;
      this.positions[offset + 1] =
        this.radial.y * radius + this.tangent.y * side + this.orbitalNormal.y * height;
      this.positions[offset + 2] =
        this.radial.z * radius + this.tangent.z * side + this.orbitalNormal.z * height;
      const orbitalSpeed = event.visualRadius * (0.58 + pseudoRandom(index, 4) * 0.74);
      const radialSpeed = event.visualRadius * (bound ? -0.14 : 0.32 + seed * 0.48);
      this.velocities[offset] = this.tangent.x * orbitalSpeed + this.radial.x * radialSpeed;
      this.velocities[offset + 1] = this.tangent.y * orbitalSpeed + this.radial.y * radialSpeed;
      this.velocities[offset + 2] = this.tangent.z * orbitalSpeed + this.radial.z * radialSpeed;
      const inwardAcceleration = bound
        ? -event.visualRadius * (0.34 + 0.3 * (1.0 - longitudinal))
        : -event.visualRadius * 0.06;
      this.writeVector(this.accelerations, index, this.radial, inwardAcceleration);
      this.color
        .set(event.participantColors[victimIndex])
        .lerp(ImpactEjectaCloud.HOT_WHITE, 0.24 + pseudoRandom(index, 5) * 0.52);
      this.writeColor(index, this.color);
      this.sizes[index] = victimRadius * (0.035 + pseudoRandom(index, 6) * 0.13);
      this.seeds[index] = pseudoRandom(index, 7);
    }
  }

  private writeVector(
    target: Float32Array,
    index: number,
    vector: Vector3,
    scale: number,
  ): void {
    const offset = index * 3;
    target[offset] = vector.x * scale;
    target[offset + 1] = vector.y * scale;
    target[offset + 2] = vector.z * scale;
  }

  private writeColor(index: number, color: Color): void {
    color.toArray(this.colors, index * 3);
  }

  private static readonly UP = new Vector3(0, 1, 0);
  private static readonly RIGHT = new Vector3(1, 0, 0);
  private static readonly HOT_WHITE = new Color(1.0, 0.9, 0.68);
}
