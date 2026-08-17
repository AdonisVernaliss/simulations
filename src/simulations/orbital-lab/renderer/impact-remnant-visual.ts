import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Group,
  Mesh,
  Points,
  ShaderMaterial,
  SphereGeometry,
} from 'three';

import type { QualityLevel } from './orbital-renderer';
import { createImpactDebrisLayout } from './impact-remnant-layout';

const DEBRIS_CAPACITY = 420;
const DEBRIS_COUNTS: Record<QualityLevel, number> = {
  low: 110,
  balanced: 240,
  high: DEBRIS_CAPACITY,
};

const VAPOR_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vPosition;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VAPOR_FRAGMENT_SHADER = `
  precision highp float;
  uniform float uAge;
  varying vec3 vNormal;
  varying vec3 vPosition;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.17);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
          mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
          mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    float billow = noise(vPosition * 4.7 + vec3(uAge * 0.045, -uAge * 0.028, 1.7));
    float fine = noise(vPosition * 11.0 - vec3(0.0, uAge * 0.036, uAge * 0.019));
    float rim = pow(1.0 - abs(vNormal.z), 1.7);
    float density = smoothstep(0.36, 0.78, billow * 0.74 + fine * 0.26);
    float cooling = mix(1.0, 0.42, smoothstep(5.0, 36.0, uAge));
    vec3 hotSilicate = vec3(1.0, 0.31, 0.045);
    vec3 vapor = vec3(0.42, 0.12, 0.035);
    vec3 color = mix(vapor, hotSilicate, density) * cooling;
    float alpha = rim * density * mix(0.22, 0.08, smoothstep(4.0, 36.0, uAge));
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const DEBRIS_VERTEX_SHADER = `
  attribute float aTemperature;
  attribute float aSize;
  attribute float aPhase;
  uniform float uAge;
  varying float vTemperature;
  varying float vPhase;

  void main() {
    float radius = length(position.xz);
    float angularSpeed = 0.42 / pow(max(radius, 1.0), 1.5);
    float angle = uAge * angularSpeed;
    float c = cos(angle);
    float s = sin(angle);
    vec3 animated = vec3(
      c * position.x - s * position.z,
      position.y + sin(uAge * 0.3 + aPhase) * 0.025,
      s * position.x + c * position.z
    );
    vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * 520.0 / max(-viewPosition.z, 0.2), 1.0, 11.0);
    vTemperature = aTemperature;
    vPhase = aPhase;
  }
`;

const DEBRIS_FRAGMENT_SHADER = `
  precision highp float;
  uniform float uAge;
  varying float vTemperature;
  varying float vPhase;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point) * 2.0;
    if (radius >= 1.0) discard;
    float core = 1.0 - smoothstep(0.08, 1.0, radius);
    float heat = vTemperature * exp(-uAge * (0.028 + fract(vPhase) * 0.012));
    vec3 cooledRock = vec3(0.075, 0.052, 0.043);
    vec3 liquidRock = vec3(1.0, 0.19, 0.018);
    vec3 incandescent = vec3(1.0, 0.82, 0.38);
    vec3 color = mix(cooledRock, liquidRock, smoothstep(0.08, 0.7, heat));
    color = mix(color, incandescent, smoothstep(0.68, 1.0, heat));
    float fade = mix(0.82, 0.28, smoothstep(8.0, 42.0, uAge));
    gl_FragColor = vec4(color, core * fade);
  }
`;

export class ImpactRemnantVisual {
  readonly group = new Group();

  private readonly vaporMaterial = new ShaderMaterial({
    uniforms: { uAge: { value: 0 } },
    vertexShader: VAPOR_VERTEX_SHADER,
    fragmentShader: VAPOR_FRAGMENT_SHADER,
    transparent: true,
    side: BackSide,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly debrisMaterial = new ShaderMaterial({
    uniforms: { uAge: { value: 0 } },
    vertexShader: DEBRIS_VERTEX_SHADER,
    fragmentShader: DEBRIS_FRAGMENT_SHADER,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly vapor: Mesh<SphereGeometry, ShaderMaterial>;
  private readonly debris: Points<BufferGeometry, ShaderMaterial>;
  private quality: QualityLevel;
  private age = 0;

  constructor(quality: QualityLevel) {
    this.quality = quality;
    this.vapor = new Mesh(this.createVaporGeometry(), this.vaporMaterial);
    this.vapor.scale.set(1.34, 1.18, 1.34);
    this.vapor.renderOrder = 2;

    const layout = createImpactDebrisLayout(DEBRIS_CAPACITY);
    const debrisGeometry = new BufferGeometry();
    debrisGeometry.setAttribute('position', new BufferAttribute(layout.positions, 3));
    debrisGeometry.setAttribute('aTemperature', new BufferAttribute(layout.temperatures, 1));
    debrisGeometry.setAttribute('aSize', new BufferAttribute(layout.sizes, 1));
    debrisGeometry.setAttribute('aPhase', new BufferAttribute(layout.phases, 1));
    debrisGeometry.setDrawRange(0, DEBRIS_COUNTS[quality]);
    this.debris = new Points(debrisGeometry, this.debrisMaterial);
    this.debris.renderOrder = 3;
    this.group.add(this.vapor, this.debris);
  }

  update(elapsedSeconds: number): void {
    this.age += elapsedSeconds;
    this.vaporMaterial.uniforms.uAge!.value = this.age;
    this.debrisMaterial.uniforms.uAge!.value = this.age;
  }

  setQuality(quality: QualityLevel): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.vapor.geometry.dispose();
    this.vapor.geometry = this.createVaporGeometry();
    this.debris.geometry.setDrawRange(0, DEBRIS_COUNTS[quality]);
  }

  dispose(): void {
    this.vapor.geometry.dispose();
    this.vaporMaterial.dispose();
    this.debris.geometry.dispose();
    this.debrisMaterial.dispose();
  }

  private createVaporGeometry(): SphereGeometry {
    const segments = this.quality === 'high' ? 48 : this.quality === 'balanced' ? 32 : 18;
    return new SphereGeometry(1, segments, Math.max(10, Math.floor(segments * 0.62)));
  }
}
