import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  LinearMipmapLinearFilter,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  TorusGeometry,
  Vector3,
} from 'three';

import type { BodyMetadata } from '../worker-protocol';
import type { QualityLevel } from './orbital-renderer';

interface GeometryDetail {
  readonly widthSegments: number;
  readonly heightSegments: number;
  readonly ringSegments: number;
  readonly anisotropy: number;
}

const GEOMETRY_DETAIL: Record<QualityLevel, GeometryDetail> = {
  low: { widthSegments: 16, heightSegments: 10, ringSegments: 40, anisotropy: 1 },
  balanced: { widthSegments: 32, heightSegments: 20, ringSegments: 72, anisotropy: 4 },
  high: { widthSegments: 64, heightSegments: 40, ringSegments: 128, anisotropy: 8 },
};

const OBSERVATIONAL_TEXTURES = {
  earth: '/textures/planets/earth-blue-marble.jpg',
  venus: '/textures/planets/venus.jpg',
  mars: '/textures/planets/mars.jpg',
  jupiter: '/textures/planets/jupiter.jpg',
} as const;

const SUN_VERTEX_SHADER = `
  varying vec3 vObjectNormal;
  varying vec3 vViewNormal;

  void main() {
    vObjectNormal = normalize(normal);
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SUN_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vObjectNormal;
  varying vec3 vViewNormal;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
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

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise(p);
      p = p * 2.03 + vec3(7.1, 3.7, 5.9);
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec3 flow = vObjectNormal * 8.0 + vec3(0.0, uTime * 0.018, uTime * 0.011);
    float cells = fbm(flow);
    float fineCells = noise(vObjectNormal * 52.0 + uTime * 0.025);
    float activity = fbm(vObjectNormal * 2.5 + vec3(4.0, -uTime * 0.002, 1.0));
    float spotMask = smoothstep(0.71, 0.82, activity) * smoothstep(0.38, 0.7, cells);
    float limb = pow(clamp(dot(normalize(vViewNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 0.16);
    vec3 dark = uColor * vec3(0.55, 0.19, 0.045);
    vec3 bright = uColor * vec3(1.18, 0.82, 0.34);
    vec3 color = mix(dark, bright, clamp(cells * 0.82 + fineCells * 0.22, 0.0, 1.0));
    color *= 1.0 - spotMask * 0.72;
    color *= 0.7 + 0.3 * limb;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const MOLTEN_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColor;
  varying vec3 vObjectNormal;
  varying vec3 vViewNormal;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
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

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise(p);
      p = p * 2.07 + vec3(4.2, 8.3, 2.7);
      amplitude *= 0.47;
    }
    return value;
  }

  void main() {
    vec3 advected = vObjectNormal * 6.8 + vec3(uTime * 0.025, 0.0, -uTime * 0.018);
    float broad = fbm(advected);
    float crustCells = fbm(vObjectNormal * 17.0 + vec3(0.0, uTime * 0.012, 0.0));
    float fissures = 1.0 - smoothstep(0.045, 0.16, abs(crustCells - 0.54));
    float exposedMelt = smoothstep(0.49, 0.73, broad) * 0.55 + fissures;
    float limb = pow(clamp(vViewNormal.z, 0.0, 1.0), 0.28);
    vec3 cooledRock = vec3(0.055, 0.024, 0.018) * (0.65 + broad * 0.55);
    vec3 lava = mix(uColor * vec3(0.9, 0.16, 0.018), vec3(1.0, 0.9, 0.42), fissures);
    vec3 color = mix(cooledRock, lava, clamp(exposedMelt, 0.0, 1.0));
    color *= 0.76 + 0.24 * limb;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const BLACK_HOLE_VERTEX_SHADER = `
  varying vec2 vUvPosition;

  void main() {
    vUvPosition = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BLACK_HOLE_FRAGMENT_SHADER = `
  uniform float uInclination;
  varying vec2 vUvPosition;

  void main() {
    vec2 p = vUvPosition;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float shadow = 1.0 - smoothstep(0.515, 0.535, radius);
    float photonRing = exp(-abs(radius - 0.575) * 150.0);
    float arcRadius = 0.69 + 0.035 * cos(angle * 2.0);
    float lensedArc = exp(-abs(radius - arcRadius) * 75.0);
    lensedArc *= smoothstep(0.10, 0.32, abs(p.y));
    lensedArc *= mix(0.18, 0.9, uInclination);
    vec3 ringColor = mix(vec3(1.0, 0.42, 0.10), vec3(0.92, 0.97, 1.0), smoothstep(-0.75, 0.75, p.x));
    vec3 color = ringColor * (photonRing * 1.45 + lensedArc * 0.52);
    color *= 1.0 - shadow;
    float alpha = max(shadow, clamp(photonRing + lensedArc, 0.0, 1.0));
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const ACCRETION_DISK_VERTEX_SHADER = `
  varying vec2 vDiskPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldTangent;

  void main() {
    vDiskPosition = position.xy;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec3 localTangent = normalize(vec3(-position.y, position.x, 0.0));
    vWorldTangent = normalize(mat3(modelMatrix) * localTangent);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const ACCRETION_DISK_FRAGMENT_SHADER = `
  uniform float uVisualTime;
  uniform float uActivity;
  varying vec2 vDiskPosition;
  varying vec3 vWorldPosition;
  varying vec3 vWorldTangent;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    float radius = length(vDiskPosition);
    float angle = atan(vDiskPosition.y, vDiskPosition.x);
    float normalizedRadius = clamp((radius - 1.42) / (4.2 - 1.42), 0.0, 1.0);
    float innerFade = smoothstep(1.42, 1.58, radius);
    float outerFade = 1.0 - smoothstep(3.55, 4.2, radius);
    float turbulence = sin(angle * 11.0 - uVisualTime * 2.4 + radius * 21.0);
    turbulence += 0.55 * sin(angle * 23.0 - uVisualTime * 3.7 - radius * 37.0);
    turbulence += (hash(floor(vDiskPosition * 34.0)) - 0.5) * 0.42;
    float filaments = 0.72 + 0.28 * smoothstep(-0.75, 0.95, turbulence);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float lineOfSightVelocity = dot(vWorldTangent, viewDirection);
    float doppler = mix(0.48, 1.62, smoothstep(-0.92, 0.92, lineOfSightVelocity));
    vec3 outerColor = vec3(0.92, 0.19, 0.025);
    vec3 middleColor = vec3(1.0, 0.57, 0.12);
    vec3 innerColor = vec3(1.0, 0.96, 0.82);
    vec3 color = mix(middleColor, outerColor, smoothstep(0.35, 1.0, normalizedRadius));
    color = mix(innerColor, color, smoothstep(0.0, 0.42, normalizedRadius));
    float alpha = innerFade * outerFade * filaments * mix(0.48, 0.92, uActivity);
    alpha *= 0.68 + 0.32 * (1.0 - normalizedRadius);
    if (alpha < 0.012) discard;
    gl_FragColor = vec4(color * doppler * mix(0.86, 1.25, uActivity), alpha);
  }
`;

const hash2 = (x: number, y: number, seed: number): number => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43_758.5453;
  return value - Math.floor(value);
};

const valueNoise = (x: number, y: number, seed: number): number => {
  const integerX = Math.floor(x);
  const integerY = Math.floor(y);
  const fractionX = x - integerX;
  const fractionY = y - integerY;
  const smoothX = fractionX * fractionX * (3 - 2 * fractionX);
  const smoothY = fractionY * fractionY * (3 - 2 * fractionY);
  const top = hash2(integerX, integerY, seed) * (1 - smoothX) +
    hash2(integerX + 1, integerY, seed) * smoothX;
  const bottom = hash2(integerX, integerY + 1, seed) * (1 - smoothX) +
    hash2(integerX + 1, integerY + 1, seed) * smoothX;
  return top * (1 - smoothY) + bottom * smoothY;
};

const fractalNoise = (x: number, y: number, seed: number): number => {
  let value = 0;
  let amplitude = 0.56;
  let frequency = 1;

  for (let octave = 0; octave < 5; octave += 1) {
    value += valueNoise(x * frequency, y * frequency, seed + octave * 17) * amplitude;
    amplitude *= 0.48;
    frequency *= 2.03;
  }

  return value;
};

const createProceduralTexture = (body: BodyMetadata): CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 384;
  const context = canvas.getContext('2d');

  if (context !== null) {
    const image = context.createImageData(canvas.width, canvas.height);
    const base = new Color(body.color);
    const seed = [...body.id].reduce((sum, character) => sum + character.charCodeAt(0), 19);

    for (let y = 0; y < canvas.height; y += 1) {
      const latitude = y / canvas.height;
      for (let x = 0; x < canvas.width; x += 1) {
        const longitude = x / canvas.width;
        const noise = fractalNoise(longitude * 9, latitude * 4.5, seed);
        const band = Math.sin(latitude * Math.PI * (body.kind === 'gas-giant' ? 36 : 13));
        let variation = 0.58 + noise * 0.56;

        if (body.kind === 'gas-giant' || body.kind === 'ice-giant') {
          variation = 0.76 + band * 0.08 + noise * 0.22;
        }

        if (body.surface === 'saturn') {
          variation += Math.sin(latitude * Math.PI * 72) * 0.035;
        }

        const offset = (y * canvas.width + x) * 4;
        image.data[offset] = Math.min(255, base.r * 255 * variation);
        image.data[offset + 1] = Math.min(255, base.g * 255 * variation);
        image.data[offset + 2] = Math.min(255, base.b * 255 * variation);
        image.data[offset + 3] = 255;
      }
    }

    context.putImageData(image, 0, 0);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  return texture;
};

export class CelestialMaterialLibrary {
  private readonly textures = new Map<string, Texture>();
  private readonly loader = new TextureLoader();

  constructor(private readonly maximumAnisotropy: number) {
    for (const [surface, path] of Object.entries(OBSERVATIONAL_TEXTURES)) {
      const texture = this.loader.load(path);
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.minFilter = LinearMipmapLinearFilter;
      this.textures.set(surface, texture);
    }
  }

  createSurfaceMaterial(body: BodyMetadata): Material {
    if (body.surface === 'molten') {
      return new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new Color(body.color) },
        },
        vertexShader: SUN_VERTEX_SHADER,
        fragmentShader: MOLTEN_FRAGMENT_SHADER,
        toneMapped: false,
      });
    }

    if (body.kind === 'star') {
      return new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new Color(body.color) },
        },
        vertexShader: SUN_VERTEX_SHADER,
        fragmentShader: SUN_FRAGMENT_SHADER,
        toneMapped: false,
      });
    }

    if (body.kind === 'black-hole') {
      return new MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    }

    if (body.kind === 'neutron-star' || body.kind === 'pulsar') {
      return new MeshStandardMaterial({
        color: body.color,
        emissive: body.color,
        emissiveIntensity: body.kind === 'pulsar' ? 2.4 : 1.45,
        roughness: 0.38,
        metalness: 0,
        toneMapped: false,
      });
    }

    let texture = this.textures.get(body.surface);
    if (texture === undefined) {
      const proceduralKey = `procedural:${body.kind}:${body.surface}:${body.color}`;
      texture = this.textures.get(proceduralKey);
      if (texture === undefined) {
        texture = createProceduralTexture(body);
        this.textures.set(proceduralKey, texture);
      }
    }

    return new MeshStandardMaterial({
      color: 0xffffff,
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.055,
      roughness: body.kind === 'gas-giant' || body.kind === 'ice-giant' ? 0.88 : 0.74,
      metalness: 0,
    });
  }

  setQuality(quality: QualityLevel): void {
    const requestedAnisotropy = GEOMETRY_DETAIL[quality].anisotropy;
    for (const texture of this.textures.values()) {
      texture.anisotropy = Math.min(requestedAnisotropy, this.maximumAnisotropy);
      texture.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const texture of this.textures.values()) {
      texture.dispose();
    }
    this.textures.clear();
  }
}

export class CelestialBodyVisual {
  readonly root = new Group();
  readonly overlay = new Group();
  readonly pickMesh: Mesh<SphereGeometry, Material>;

  private readonly oriented = new Group();
  private readonly tidalFrame = new Group();
  private readonly tidalDirection = new Vector3();
  private readonly surfaceMaterial: Material;
  private readonly atmosphereMaterial: MeshBasicMaterial | undefined;
  private readonly ringMaterial: Material | undefined;
  private atmosphere: Mesh<SphereGeometry, MeshBasicMaterial> | undefined;
  private ring: Mesh<RingGeometry, Material> | undefined;
  private blackHoleAppearance: Mesh<PlaneGeometry, ShaderMaterial> | undefined;
  private blackHoleDiskFrame: Group | undefined;
  private blackHoleDisk: Mesh<RingGeometry, ShaderMaterial> | undefined;
  private compactField: Group | undefined;
  private readonly decorativeMeshes: Mesh[] = [];
  private readonly diskNormal = new Vector3();
  private readonly viewDirection = new Vector3();
  private visualTime = 0;
  private quality: QualityLevel;

  constructor(
    readonly body: BodyMetadata,
    bodyIndex: number,
    quality: QualityLevel,
    materials: CelestialMaterialLibrary,
    glowTexture: Texture,
  ) {
    this.quality = quality;
    this.surfaceMaterial = materials.createSurfaceMaterial(body);
    this.pickMesh = new Mesh(this.createSphereGeometry(), this.surfaceMaterial);
    this.pickMesh.userData.bodyIndex = bodyIndex;
    this.pickMesh.scale.y = body.kind === 'gas-giant' ? 0.94 : body.kind === 'ice-giant' ? 0.97 : 1;
    this.oriented.rotation.x = Math.PI / 2 - body.axialTilt;
    this.oriented.add(this.pickMesh);
    this.tidalFrame.add(this.oriented);
    this.root.add(this.tidalFrame);
    this.root.scale.setScalar(body.renderRadius);
    this.overlay.scale.setScalar(body.renderRadius);

    if (body.surface === 'earth') {
      this.atmosphereMaterial = new MeshBasicMaterial({
        color: 0x64b9ff,
        transparent: true,
        opacity: 0.16,
        side: BackSide,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this.atmosphere = new Mesh(this.createSphereGeometry(), this.atmosphereMaterial);
      this.atmosphere.scale.setScalar(1.045);
      this.oriented.add(this.atmosphere);
    }

    if (body.surface === 'saturn') {
      this.ringMaterial = new MeshStandardMaterial({
        color: 0xcab98f,
        transparent: true,
        opacity: 0.68,
        roughness: 0.96,
        side: DoubleSide,
        depthWrite: false,
      });
      this.ring = new Mesh(this.createRingGeometry(1.35, 2.28), this.ringMaterial);
      this.ring.rotation.x = Math.PI / 2;
      this.oriented.add(this.ring);
    }

    if (body.kind === 'black-hole') {
      const appearanceMaterial = new ShaderMaterial({
        uniforms: { uInclination: { value: 0.75 } },
        vertexShader: BLACK_HOLE_VERTEX_SHADER,
        fragmentShader: BLACK_HOLE_FRAGMENT_SHADER,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      this.blackHoleAppearance = new Mesh(new PlaneGeometry(3.4, 3.4), appearanceMaterial);
      this.blackHoleAppearance.renderOrder = 5;
      this.overlay.add(this.blackHoleAppearance);

      this.blackHoleDiskFrame = new Group();
      this.blackHoleDiskFrame.rotation.set(body.axialTilt, body.axialTilt * 0.24, 0.18);
      const diskMaterial = new ShaderMaterial({
        uniforms: {
          uVisualTime: { value: 0 },
          uActivity: { value: body.surface === 'quasar' ? 1 : 0.58 },
        },
        vertexShader: ACCRETION_DISK_VERTEX_SHADER,
        fragmentShader: ACCRETION_DISK_FRAGMENT_SHADER,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      });
      this.blackHoleDisk = new Mesh(this.createRingGeometry(1.42, 4.2), diskMaterial);
      this.blackHoleDisk.renderOrder = 3;
      this.blackHoleDiskFrame.add(this.blackHoleDisk);
      this.overlay.add(this.blackHoleDiskFrame);

      if (body.surface === 'quasar') {
        this.addQuasarJets(this.blackHoleDiskFrame);
      }
    }

    if (body.kind === 'neutron-star' || body.kind === 'pulsar') {
      this.addCompactStarField(body.kind === 'pulsar');
    }

    if (body.kind === 'star' || body.surface === 'molten') {
      const glow = new Sprite(
        new SpriteMaterial({
          map: glowTexture,
          color: body.surface === 'molten' ? 0xff4f14 : body.color,
          transparent: true,
          opacity: body.surface === 'molten' ? 0.24 : 0.7,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      const glowScale = body.surface === 'molten' ? 2.2 : 3.6;
      glow.scale.set(glowScale, glowScale, 1);
      glow.renderOrder = -1;
      this.root.add(glow);
    }
  }

  update(position: Vector3, time: number): void {
    this.root.position.copy(position);
    this.overlay.position.copy(position);
    const rotationPhase = (time * this.body.rotationRate) % (Math.PI * 2);
    this.pickMesh.rotation.y = rotationPhase;
    if (this.compactField !== undefined) {
      this.compactField.rotation.y = rotationPhase;
    }

    if (this.surfaceMaterial instanceof ShaderMaterial) {
      const timeUniform = this.surfaceMaterial.uniforms.uTime;
      if (timeUniform !== undefined) {
        timeUniform.value = time;
      }
    }

  }

  faceCamera(cameraPosition: Vector3): void {
    if (this.blackHoleAppearance === undefined || this.blackHoleDiskFrame === undefined) {
      return;
    }

    this.blackHoleAppearance.lookAt(cameraPosition);
    this.diskNormal.set(0, 0, 1).applyQuaternion(this.blackHoleDiskFrame.quaternion).normalize();
    this.viewDirection.subVectors(cameraPosition, this.overlay.position).normalize();
    const faceOn = Math.abs(this.diskNormal.dot(this.viewDirection));
    this.blackHoleAppearance.material.uniforms.uInclination!.value = Math.sqrt(
      Math.max(0, 1 - faceOn * faceOn),
    );
  }

  animate(elapsedSeconds: number): void {
    if (this.blackHoleDisk === undefined) {
      return;
    }

    this.visualTime += elapsedSeconds;
    this.blackHoleDisk.material.uniforms.uVisualTime!.value = this.visualTime;
  }

  setTidalDeformation(
    directionX: number,
    directionY: number,
    directionZ: number,
    stressRatio: number,
  ): void {
    if (this.body.kind === 'black-hole' || stressRatio < 0.015) {
      this.tidalFrame.quaternion.identity();
      this.tidalFrame.scale.set(1, 1, 1);
      return;
    }

    this.tidalDirection.set(directionX, directionY, directionZ);
    if (this.tidalDirection.lengthSq() <= Number.EPSILON) {
      return;
    }

    this.tidalDirection.normalize();
    this.tidalFrame.quaternion.setFromUnitVectors(
      CelestialBodyVisual.TIDAL_AXIS,
      this.tidalDirection,
    );
    const stretch = 1 + Math.min(7, (stressRatio - 0.015) * 3.6);
    const transverse = 1 / Math.sqrt(stretch);
    this.tidalFrame.scale.set(stretch, transverse, transverse);
  }

  setQuality(quality: QualityLevel): void {
    if (this.quality === quality) {
      return;
    }

    this.quality = quality;
    this.pickMesh.geometry.dispose();
    this.pickMesh.geometry = this.createSphereGeometry();

    if (this.atmosphere !== undefined) {
      this.atmosphere.geometry.dispose();
      this.atmosphere.geometry = this.createSphereGeometry();
    }

    if (this.ring !== undefined) {
      this.ring.geometry.dispose();
      this.ring.geometry = this.createRingGeometry(1.35, 2.28);
    }

    if (this.blackHoleDisk !== undefined) {
      this.blackHoleDisk.geometry.dispose();
      this.blackHoleDisk.geometry = this.createRingGeometry(1.42, 4.2);
    }
  }

  dispose(): void {
    this.pickMesh.geometry.dispose();
    this.surfaceMaterial.dispose();
    this.atmosphere?.geometry.dispose();
    this.atmosphereMaterial?.dispose();
    this.ring?.geometry.dispose();
    this.ringMaterial?.dispose();
    this.blackHoleAppearance?.geometry.dispose();
    this.blackHoleAppearance?.material.dispose();
    this.blackHoleDisk?.geometry.dispose();
    this.blackHoleDisk?.material.dispose();
    for (const mesh of this.decorativeMeshes) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
      } else {
        mesh.material.dispose();
      }
    }

    for (const child of this.root.children) {
      if (child instanceof Sprite) {
        child.material.dispose();
      }
    }
  }

  private createSphereGeometry(): SphereGeometry {
    const detail = GEOMETRY_DETAIL[this.quality];
    return new SphereGeometry(1, detail.widthSegments, detail.heightSegments);
  }

  private static readonly TIDAL_AXIS = new Vector3(1, 0, 0);

  private createRingGeometry(innerRadius: number, outerRadius: number): RingGeometry {
    return new RingGeometry(innerRadius, outerRadius, GEOMETRY_DETAIL[this.quality].ringSegments);
  }

  private addCompactStarField(includeBeams: boolean): void {
    this.compactField = new Group();
    this.compactField.rotation.z = 0.42;

    for (const radius of [1.5, 2.05, 2.6]) {
      const line = new Mesh(
        new TorusGeometry(radius, 0.014, 5, GEOMETRY_DETAIL[this.quality].ringSegments),
        new MeshBasicMaterial({
          color: 0x7adfff,
          transparent: true,
          opacity: 0.18,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      line.rotation.x = Math.PI / 2;
      this.compactField.add(line);
      this.decorativeMeshes.push(line);
    }

    if (includeBeams) {
      for (const direction of [-1, 1]) {
        const beam = new Mesh(
          new ConeGeometry(0.58, 7.5, 24, 1, true),
          new MeshBasicMaterial({
            color: 0xbcefff,
            transparent: true,
            opacity: 0.052,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
            toneMapped: false,
          }),
        );
        beam.position.y = direction * 3.75;
        if (direction < 0) beam.rotation.z = Math.PI;
        this.compactField.add(beam);
        this.decorativeMeshes.push(beam);
      }
    }

    this.oriented.add(this.compactField);
  }

  private addQuasarJets(frame: Group): void {
    for (const direction of [-1, 1]) {
      const jet = new Mesh(
        new ConeGeometry(0.72, 12, 32, 1, true),
        new MeshBasicMaterial({
          color: 0xb5e9ff,
          transparent: true,
          opacity: 0.095,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
          toneMapped: false,
        }),
      );
      jet.rotation.x = direction * Math.PI / 2;
      jet.position.z = direction * 6;
      jet.renderOrder = 2;
      frame.add(jet);
      this.decorativeMeshes.push(jet);

      const spine = new Mesh(
        new ConeGeometry(0.16, 11, 20, 1, true),
        new MeshBasicMaterial({
          color: 0xeaf9ff,
          transparent: true,
          opacity: 0.16,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
          toneMapped: false,
        }),
      );
      spine.rotation.x = direction * Math.PI / 2;
      spine.position.z = direction * 5.5;
      spine.renderOrder = 2;
      frame.add(spine);
      this.decorativeMeshes.push(spine);
    }
  }
}
