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
  low: '/textures/sky/nasa-deep-star-map-low.jpg',
  balanced: '/textures/sky/nasa-deep-star-map-balanced.jpg',
  high: '/textures/sky/nasa-deep-star-map-high.jpg',
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
    float skyRotation = 1.87;
    direction = vec3(
      direction.x,
      cos(skyRotation) * direction.y - sin(skyRotation) * direction.z,
      sin(skyRotation) * direction.y + cos(skyRotation) * direction.z
    );
    vec2 uv = vec2(
      atan(direction.z, direction.x) / (2.0 * PI) + 0.5,
      asin(clamp(direction.y, -1.0, 1.0)) / PI + 0.5
    );
    vec3 observed = texture2D(uSkyMap, uv).rgb;
    vec3 blackPoint = max(observed - vec3(0.00025), vec3(0.0));
    float luminance = dot(blackPoint, vec3(0.2126, 0.7152, 0.0722));
    float exposure = mix(3.2, 5.4, smoothstep(0.008, 0.1, luminance));
    vec3 exposed = vec3(1.0) - exp(-blackPoint * exposure);
    gl_FragColor = vec4(exposed, 1.0);
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
      new SphereGeometry(90, 96, 64),
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
