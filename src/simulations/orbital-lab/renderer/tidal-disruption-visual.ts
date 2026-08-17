import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Points,
  ShaderMaterial,
} from 'three';

import type { QualityLevel } from './orbital-renderer';
import { createTidalDisruptionLayout } from './tidal-disruption-layout';

const TRACER_CAPACITY = 320;
const TRACER_COUNTS: Record<QualityLevel, number> = {
  low: 80,
  balanced: 180,
  high: TRACER_CAPACITY,
};

const TIDAL_STREAM_VERTEX_SHADER = `
  attribute float aSide;
  attribute float aProgress;
  attribute float aPhase;
  attribute float aSize;
  attribute float aTemperature;
  uniform float uStrength;
  uniform float uTime;
  varying float vTemperature;
  varying float vProgress;
  varying float vStrength;

  void main() {
    float response = smoothstep(0.0, 1.0, uStrength);
    float extent = mix(0.92 + aProgress * 0.24, abs(position.x), pow(response, 0.72));
    float transverse = mix(0.1, 1.0, response);
    vec3 animated = vec3(aSide * extent, position.y * transverse, position.z * transverse);
    float shear = aProgress * aProgress * response;
    animated.y += sin(aPhase + uTime * (0.34 + aProgress * 0.18)) * shear * 0.14;
    animated.z += aSide * sin(aPhase * 0.73 + uTime * 0.27) * shear * 0.32;

    vec4 viewPosition = modelViewMatrix * vec4(animated, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(aSize * (410.0 + response * 260.0) / max(-viewPosition.z, 0.2), 1.0, 10.0);
    vTemperature = aTemperature;
    vProgress = aProgress;
    vStrength = response;
  }
`;

const TIDAL_STREAM_FRAGMENT_SHADER = `
  precision highp float;
  uniform vec3 uBodyColor;
  varying float vTemperature;
  varying float vProgress;
  varying float vStrength;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point) * 2.0;
    if (radius >= 1.0) discard;
    float feather = 1.0 - smoothstep(0.12, 1.0, radius);
    vec3 coolStream = uBodyColor * vec3(0.42, 0.5, 0.62);
    vec3 heatedGas = vec3(1.0, 0.62, 0.24);
    vec3 color = mix(coolStream, heatedGas, vTemperature * (1.0 - vProgress * 0.48));
    float emergence = smoothstep(0.035, 0.22, vStrength);
    float dilution = mix(1.0, 0.38, vProgress);
    gl_FragColor = vec4(color, feather * emergence * dilution * 0.82);
  }
`;

export class TidalDisruptionVisual {
  readonly group = new Group();

  private readonly material: ShaderMaterial;
  private readonly points: Points<BufferGeometry, ShaderMaterial>;
  private targetStrength = 0;
  private currentStrength = 0;
  private time = 0;
  private quality: QualityLevel;

  constructor(color: string, quality: QualityLevel) {
    this.quality = quality;
    const layout = createTidalDisruptionLayout(TRACER_CAPACITY);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(layout.positions, 3));
    geometry.setAttribute('aSide', new BufferAttribute(layout.sides, 1));
    geometry.setAttribute('aProgress', new BufferAttribute(layout.progress, 1));
    geometry.setAttribute('aPhase', new BufferAttribute(layout.phases, 1));
    geometry.setAttribute('aSize', new BufferAttribute(layout.sizes, 1));
    geometry.setAttribute('aTemperature', new BufferAttribute(layout.temperatures, 1));
    geometry.setDrawRange(0, TRACER_COUNTS[quality]);

    this.material = new ShaderMaterial({
      uniforms: {
        uBodyColor: { value: new Color(color) },
        uStrength: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: TIDAL_STREAM_VERTEX_SHADER,
      fragmentShader: TIDAL_STREAM_FRAGMENT_SHADER,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.group.visible = false;
    this.group.add(this.points);
  }

  setStress(stressRatio: number): void {
    const finiteStress = Number.isFinite(stressRatio) ? stressRatio : 0;
    this.targetStrength = Math.max(0, Math.min(1, (finiteStress - 0.06) / 0.94));
  }

  update(elapsedSeconds: number): void {
    this.time += elapsedSeconds;
    const blend = 1 - Math.exp(-Math.max(0, elapsedSeconds) * 5.5);
    this.currentStrength += (this.targetStrength - this.currentStrength) * blend;
    this.group.visible = this.currentStrength > 0.008;
    this.material.uniforms.uStrength!.value = this.currentStrength;
    this.material.uniforms.uTime!.value = this.time;
  }

  setQuality(quality: QualityLevel): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.points.geometry.setDrawRange(0, TRACER_COUNTS[quality]);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
