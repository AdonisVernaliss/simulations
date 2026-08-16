import {
  BackSide,
  LinearMipmapLinearFilter,
  Mesh,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three';

import type { QualityLevel } from './orbital-renderer';

const SKY_TEXTURES: Record<QualityLevel, string> = {
  low: '/textures/sky/tess-all-sky-low.jpg',
  balanced: '/textures/sky/tess-all-sky-balanced.jpg',
  high: '/textures/sky/tess-all-sky-high.jpg',
};

const SKY_VERTEX_SHADER = `
  varying vec3 vSkyDirection;

  void main() {
    vSkyDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = `
  uniform sampler2D uSkyMap;
  varying vec3 vSkyDirection;

  const float PI = 3.141592653589793;

  void main() {
    vec3 direction = normalize(vSkyDirection);
    vec2 uv = vec2(
      atan(direction.z, direction.x) / (2.0 * PI) + 0.5,
      asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5
    );
    vec3 observed = texture2D(uSkyMap, uv).rgb;
    vec3 lifted = observed * 1.26 + pow(observed, vec3(0.72)) * 0.14;
    gl_FragColor = vec4(lifted, 1.0);
  }
`;

export class SkyEnvironment {
  readonly mesh: Mesh<SphereGeometry, ShaderMaterial>;

  private readonly loader = new TextureLoader();
  private readonly textures = new Map<QualityLevel, Texture>();
  private readonly cameraPosition = new Vector3();
  private activeTexture: Texture;

  constructor(private readonly maximumAnisotropy: number) {
    this.activeTexture = this.getTexture('balanced');
    this.mesh = new Mesh(
      new SphereGeometry(90, 48, 24),
      new ShaderMaterial({
        uniforms: { uSkyMap: { value: this.activeTexture } },
        vertexShader: SKY_VERTEX_SHADER,
        fragmentShader: SKY_FRAGMENT_SHADER,
        side: BackSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -100;
  }

  get texture(): Texture {
    return this.activeTexture;
  }

  setQuality(quality: QualityLevel): void {
    this.activeTexture = this.getTexture(quality);
    this.mesh.material.uniforms.uSkyMap!.value = this.activeTexture;
  }

  update(cameraPosition: Vector3): void {
    if (!this.cameraPosition.equals(cameraPosition)) {
      this.cameraPosition.copy(cameraPosition);
      this.mesh.position.copy(cameraPosition);
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    this.textures.clear();
  }

  private getTexture(quality: QualityLevel): Texture {
    const cached = this.textures.get(quality);
    if (cached !== undefined) {
      return cached;
    }

    const texture = this.loader.load(SKY_TEXTURES[quality]);
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.anisotropy = Math.min(
      quality === 'high' ? 8 : quality === 'balanced' ? 4 : 1,
      this.maximumAnisotropy,
    );
    this.textures.set(quality, texture);
    return texture;
  }
}
