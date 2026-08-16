import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';

import type { BodyMetadata } from '../worker-protocol';
import type { QualityLevel } from './orbital-renderer';

const MAXIMUM_FIELD_BODIES = 16;

const FIELD_BODY_LIMIT: Record<QualityLevel, number> = {
  low: 4,
  balanced: 8,
  high: MAXIMUM_FIELD_BODIES,
};

const VERTEX_SHADER = `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const FRAGMENT_SHADER = `
  uniform int uBodyCount;
  uniform vec3 uBodyPositions[16];
  uniform float uBodyMasses[16];
  uniform float uSoftening;
  varying vec3 vWorldPosition;

  void main() {
    float potential = 0.0;
    float nearest = 100000.0;
    for (int index = 0; index < 16; index++) {
      if (index >= uBodyCount) {
        continue;
      }
      vec2 offset = vWorldPosition.xy - uBodyPositions[index].xy;
      float distance = sqrt(dot(offset, offset) + uSoftening * uSoftening);
      potential += uBodyMasses[index] / distance;
      nearest = min(nearest, distance);
    }

    float logarithmicPotential = log2(1.0 + potential * 3.0);
    float contourDistance = abs(fract(logarithmicPotential * 3.0) - 0.5);
    float contour = 1.0 - smoothstep(0.035, 0.11, contourDistance);
    float well = smoothstep(0.0, 1.6, logarithmicPotential) * exp(-nearest * 0.12);
    vec3 color = mix(vec3(0.025, 0.11, 0.2), vec3(0.12, 0.46, 0.72), clamp(well, 0.0, 1.0));
    float alpha = contour * 0.14 + well * 0.032;
    gl_FragColor = vec4(color, alpha);
  }
`;

export class GravityFieldVisual {
  readonly mesh: Mesh<PlaneGeometry, ShaderMaterial>;

  private bodies: readonly BodyMetadata[] = [];
  private selectedIndices: number[] = [];
  private quality: QualityLevel = 'balanced';

  constructor() {
    const positions = Array.from(
      { length: MAXIMUM_FIELD_BODIES },
      () => new Vector3(10_000, 10_000, 0),
    );
    const material = new ShaderMaterial({
      uniforms: {
        uBodyCount: { value: 0 },
        uBodyPositions: { value: positions },
        uBodyMasses: { value: new Float32Array(MAXIMUM_FIELD_BODIES) },
        uSoftening: { value: 0.025 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(2, 2), material);
    this.mesh.position.z = -0.035;
    this.mesh.visible = false;
    this.mesh.renderOrder = -2;
  }

  setBodies(bodies: readonly BodyMetadata[], span: number): void {
    this.bodies = bodies;
    this.mesh.scale.set(span, span, 1);
    this.selectBodies();
  }

  setQuality(quality: QualityLevel): void {
    this.quality = quality;
    this.selectBodies();
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  update(positions: Float32Array): void {
    if (!this.mesh.visible) {
      return;
    }

    const uniformPositions = this.mesh.material.uniforms.uBodyPositions?.value as Vector3[];
    const uniformMasses = this.mesh.material.uniforms.uBodyMasses?.value as Float32Array;
    const maximumMass = Math.max(
      ...this.selectedIndices.map((bodyIndex) => this.bodies[bodyIndex]?.mass ?? 0),
      Number.EPSILON,
    );

    this.selectedIndices.forEach((bodyIndex, uniformIndex) => {
      uniformPositions[uniformIndex]?.fromArray(positions, bodyIndex * 3);
      uniformMasses[uniformIndex] = (this.bodies[bodyIndex]?.mass ?? 0) / maximumMass;
    });
    this.mesh.material.uniforms.uBodyCount!.value = this.selectedIndices.length;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  private selectBodies(): void {
    this.selectedIndices = this.bodies
      .map((body, bodyIndex) => ({ bodyIndex, mass: body.mass }))
      .sort((left, right) => right.mass - left.mass)
      .slice(0, FIELD_BODY_LIMIT[this.quality])
      .map(({ bodyIndex }) => bodyIndex);
  }
}
