import { PerspectiveCamera, ShaderMaterial, Vector2, Vector3 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import type { BodyMetadata } from '../worker-protocol';
import type { QualityLevel } from './orbital-renderer';

const MAXIMUM_LENSES = 2;

const LENSING_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uAspect: { value: 1 },
    uLensCenters: { value: [new Vector2(-2, -2), new Vector2(-2, -2)] },
    uLensStrengths: { value: new Vector2() },
    uShadowRadii: { value: new Vector2() },
    uEnabled: { value: new Vector2() },
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uAspect;
    uniform vec2 uLensCenters[2];
    uniform vec2 uLensStrengths;
    uniform vec2 uShadowRadii;
    uniform vec2 uEnabled;
    varying vec2 vUv;

    vec2 mapThroughLens(vec2 uv, vec2 center, float strength, float enabled) {
      vec2 offset = uv - center;
      offset.x *= uAspect;
      float radius = max(length(offset), 0.0001);
      float sourceRadius = radius - enabled * strength / radius;
      vec2 mapped = center + normalize(offset) * sourceRadius;
      mapped.x = center.x + (mapped.x - center.x) / uAspect;
      return mapped;
    }

    float lensRadius(vec2 uv, vec2 center) {
      vec2 offset = uv - center;
      offset.x *= uAspect;
      return length(offset);
    }

    void main() {
      vec2 sampleUv = mapThroughLens(vUv, uLensCenters[0], uLensStrengths.x, uEnabled.x);
      sampleUv = mapThroughLens(sampleUv, uLensCenters[1], uLensStrengths.y, uEnabled.y);
      vec3 color = texture2D(tDiffuse, clamp(sampleUv, 0.0, 1.0)).rgb;

      float radius0 = lensRadius(vUv, uLensCenters[0]);
      float radius1 = lensRadius(vUv, uLensCenters[1]);

      float shadow0 = 1.0 - step(radius0, uShadowRadii.x) * uEnabled.x;
      float shadow1 = 1.0 - step(radius1, uShadowRadii.y) * uEnabled.y;
      gl_FragColor = vec4(color * shadow0 * shadow1, 1.0);
    }
  `,
};

interface LensCandidate {
  readonly body: BodyMetadata;
  readonly bodyIndex: number;
}

export interface SchwarzschildLensScales {
  /** Squared Einstein angle expressed in vertical UV coordinates. */
  readonly strength: number;
  /** Deliberately enlarged visible shadow radius in vertical UV coordinates. */
  readonly visibleShadowRadius: number;
}

export const calculateSchwarzschildLensScales = (
  schwarzschildRadius: number,
  renderRadius: number,
  observerDistance: number,
  verticalFieldOfViewDegrees: number,
): SchwarzschildLensScales => {
  const halfVerticalField = Math.tan((verticalFieldOfViewDegrees * Math.PI) / 360);
  return {
    // θ_E² = 2 r_s / D_l for a background source at infinity, then mapped to UV.
    strength: schwarzschildRadius / (2 * observerDistance * halfVerticalField ** 2),
    visibleShadowRadius: renderRadius / (2 * observerDistance * halfVerticalField),
  };
};

export class GravitationalLensing {
  readonly pass = new ShaderPass(LENSING_SHADER);

  private readonly worldPosition = new Vector3();
  private readonly projectedPosition = new Vector3();

  update(
    bodies: readonly BodyMetadata[],
    positions: Float32Array,
    camera: PerspectiveCamera,
    quality: QualityLevel,
  ): void {
    const candidates: LensCandidate[] = bodies
      .map((body, bodyIndex) => ({ body, bodyIndex }))
      .filter(({ body }) => body.kind === 'black-hole')
      .sort((left, right) => right.body.mass - left.body.mass)
      .slice(0, quality === 'high' ? MAXIMUM_LENSES : 1);
    const material = this.pass.material as ShaderMaterial;
    const centers = material.uniforms.uLensCenters?.value as Vector2[];
    const strengths = material.uniforms.uLensStrengths?.value as Vector2;
    const shadows = material.uniforms.uShadowRadii?.value as Vector2;
    const enabled = material.uniforms.uEnabled?.value as Vector2;
    material.uniforms.uAspect!.value = camera.aspect;
    strengths.set(0, 0);
    shadows.set(0, 0);
    enabled.set(0, 0);

    for (let lensIndex = 0; lensIndex < MAXIMUM_LENSES; lensIndex += 1) {
      const candidate = candidates[lensIndex];
      const center = centers[lensIndex]!;
      if (candidate === undefined) {
        center.set(-2, -2);
        continue;
      }

      const offset = candidate.bodyIndex * 3;
      this.worldPosition.fromArray(positions, offset);
      const distance = camera.position.distanceTo(this.worldPosition);
      this.projectedPosition.copy(this.worldPosition).project(camera);
      const isVisible =
        this.projectedPosition.z >= -1 &&
        this.projectedPosition.z <= 1 &&
        distance > candidate.body.radius;

      if (!isVisible) {
        center.set(-2, -2);
        continue;
      }

      center.set(
        this.projectedPosition.x * 0.5 + 0.5,
        this.projectedPosition.y * 0.5 + 0.5,
      );
      const scales = calculateSchwarzschildLensScales(
        candidate.body.radius,
        candidate.body.renderRadius,
        distance,
        camera.fov,
      );
      strengths.setComponent(lensIndex, scales.strength);
      shadows.setComponent(lensIndex, Math.max(scales.visibleShadowRadius, 0.0015));
      enabled.setComponent(lensIndex, 1);
    }
  }

  dispose(): void {
    this.pass.dispose();
  }
}
