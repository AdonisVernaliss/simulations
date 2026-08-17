import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  LinearMipmapLinearFilter,
  Material,
  Matrix3,
  Matrix4,
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
  Vector3,
} from 'three';

import type { BodyMetadata } from '../worker-protocol';
import type { QualityLevel } from './orbital-renderer';
import {
  BLACK_HOLE_BEAM_FRAGMENT_SHADER,
  BLACK_HOLE_BEAM_VERTEX_SHADER,
} from './black-hole-beam-shader';
import { ImpactRemnantVisual } from './impact-remnant-visual';
import { createPulsarMagnetosphereLayout } from './pulsar-magnetosphere';
import { SchwarzschildBeamResources } from './schwarzschild-beam-resources';

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

const IMPACT_REMNANT_FRAGMENT_SHADER = `
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
    vec3 advected = vObjectNormal * 5.4 + vec3(uTime * 0.018, 0.0, -uTime * 0.013);
    float mantleFlow = fbm(advected);
    float plates = fbm(vObjectNormal * 10.5 + vec3(0.0, uTime * 0.006, 0.0));
    float impactHemisphere = smoothstep(
      -0.18,
      0.82,
      dot(vObjectNormal, normalize(vec3(0.68, 0.2, 0.71)))
    );
    float crust = smoothstep(0.48, 0.71, plates + (1.0 - impactHemisphere) * 0.12);
    float channels = 1.0 - smoothstep(0.035, 0.13, abs(mantleFlow - 0.53));
    float exposedMelt = clamp(
      impactHemisphere * (1.0 - crust) * 0.74 + channels * 0.46,
      0.0,
      1.0
    );
    float limb = pow(clamp(vViewNormal.z, 0.0, 1.0), 0.28);
    vec3 cooledRock = vec3(0.075, 0.054, 0.048) * (0.58 + plates * 0.62);
    vec3 lava = mix(
      uColor * vec3(0.95, 0.18, 0.018),
      vec3(1.0, 0.86, 0.38),
      channels * impactHemisphere
    );
    vec3 color = mix(cooledRock, lava, clamp(exposedMelt, 0.0, 1.0));
    color *= 0.76 + 0.24 * limb;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const STELLAR_MERGER_FRAGMENT_SHADER = `
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
    float amplitude = 0.56;
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise(p);
      p = p * 2.04 + vec3(5.7, 2.9, 8.1);
      amplitude *= 0.47;
    }
    return value;
  }

  void main() {
    float azimuth = atan(vObjectNormal.z, vObjectNormal.x);
    vec3 advected = vObjectNormal * 7.2 + vec3(uTime * 0.021, -uTime * 0.013, 0.0);
    float convection = fbm(advected);
    float shear = 0.5 + 0.5 * sin(azimuth * 7.0 + vObjectNormal.y * 9.0 - uTime * 0.09);
    float hotCell = smoothstep(0.42, 0.82, convection * 0.82 + shear * 0.2);
    float limb = pow(clamp(dot(normalize(vViewNormal), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 0.2);
    vec3 envelope = uColor * vec3(0.68, 0.17, 0.035);
    vec3 photosphere = uColor * vec3(1.2, 0.72, 0.24);
    vec3 shock = vec3(1.0, 0.91, 0.62);
    vec3 color = mix(envelope, photosphere, convection);
    color = mix(color, shock, hotCell * 0.46);
    color *= 0.66 + 0.34 * limb;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const PULSAR_BEAM_VERTEX_SHADER = `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PULSAR_BEAM_FRAGMENT_SHADER = `
  precision highp float;
  varying vec3 vLocalPosition;

  void main() {
    float axial = clamp(vLocalPosition.y / 9.5 + 0.5, 0.0, 1.0);
    float pulseCore = pow(axial, 1.35);
    float feather = 0.35 + 0.65 * smoothstep(0.0, 0.22, axial);
    vec3 color = mix(vec3(0.18, 0.58, 1.0), vec3(0.83, 0.97, 1.0), pulseCore);
    gl_FragColor = vec4(color, (0.018 + pulseCore * 0.12) * feather);
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
  readonly beamResources = new SchwarzschildBeamResources();

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
    if (body.surface === 'impact-remnant') {
      return new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new Color(body.color) },
        },
        vertexShader: SUN_VERTEX_SHADER,
        fragmentShader: IMPACT_REMNANT_FRAGMENT_SHADER,
        toneMapped: false,
      });
    }

    if (body.surface === 'stellar-merger') {
      return new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uColor: { value: new Color(body.color) },
        },
        vertexShader: SUN_VERTEX_SHADER,
        fragmentShader: STELLAR_MERGER_FRAGMENT_SHADER,
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
      return new MeshBasicMaterial({
        color: 0x000000,
        colorWrite: false,
        depthWrite: false,
        toneMapped: false,
      });
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
      emissiveIntensity: 0.105,
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
    this.beamResources.dispose();
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
  private blackHoleMaterial: ShaderMaterial | undefined;
  private blackHoleResources: SchwarzschildBeamResources | undefined;
  private compactField: Group | undefined;
  private impactRemnantVisual: ImpactRemnantVisual | undefined;
  private readonly decorativeMeshes: Mesh[] = [];
  private readonly decorativeLines: LineSegments<BufferGeometry, LineBasicMaterial>[] = [];
  private readonly cameraLocal = new Vector3();
  private readonly diskToWorld = new Matrix3();
  private readonly worldToDisk = new Matrix3();
  private readonly diskRotation = new Matrix4();
  private visualTime = 0;
  private quality: QualityLevel;

  constructor(
    readonly body: BodyMetadata,
    bodyIndex: number,
    quality: QualityLevel,
    materials: CelestialMaterialLibrary,
    glowTexture: Texture,
    skyTexture: Texture,
  ) {
    this.quality = quality;
    this.surfaceMaterial = materials.createSurfaceMaterial(body);
    this.pickMesh = new Mesh(this.createSphereGeometry(), this.surfaceMaterial);
    this.pickMesh.userData.bodyIndex = bodyIndex;
    if (body.surface === 'impact-remnant') {
      this.pickMesh.scale.set(1.1, 0.9, 1.01);
    } else {
      this.pickMesh.scale.y =
        body.kind === 'gas-giant' ? 0.94 : body.kind === 'ice-giant' ? 0.97 : 1;
    }
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
        uniforms: {
          uRayDeflection: { value: null },
          uRayInverseRadius: { value: null },
          uSkyMap: { value: skyTexture },
          uWorldToDisk: { value: this.worldToDisk },
          uDiskToWorld: { value: this.diskToWorld },
          uCameraLocal: { value: this.cameraLocal },
          uBeamTracingReady: { value: 0 },
          uVisualTime: { value: 0 },
          uMode: {
            value: body.surface === 'quasar' ? 2 : body.surface === 'accretion-disk' ? 1 : 0,
          },
          uDetail: { value: quality === 'high' ? 2 : quality === 'balanced' ? 1 : 0 },
        },
        vertexShader: BLACK_HOLE_BEAM_VERTEX_SHADER,
        fragmentShader: BLACK_HOLE_BEAM_FRAGMENT_SHADER,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      this.blackHoleMaterial = appearanceMaterial;
      this.blackHoleResources = materials.beamResources;
      this.blackHoleResources.bind(appearanceMaterial);
      this.blackHoleAppearance = new Mesh(new PlaneGeometry(28, 28), appearanceMaterial);
      this.blackHoleAppearance.renderOrder = 5;
      this.overlay.add(this.blackHoleAppearance);

      this.blackHoleDiskFrame = new Group();
      this.blackHoleDiskFrame.rotation.x = body.axialTilt;
      this.overlay.add(this.blackHoleDiskFrame);

      if (body.surface === 'quasar') {
        this.addQuasarJets(this.blackHoleDiskFrame);
      }
    }

    if (body.kind === 'neutron-star' || body.kind === 'pulsar') {
      this.addCompactStarField(body.kind === 'pulsar');
    }

    if (body.surface === 'impact-remnant') {
      this.impactRemnantVisual = new ImpactRemnantVisual(quality);
      this.oriented.add(this.impactRemnantVisual.group);
    }

    if (body.kind === 'star' || body.surface === 'impact-remnant') {
      const glow = new Sprite(
        new SpriteMaterial({
          map: glowTexture,
          color: body.surface === 'impact-remnant' ? 0xff4f14 : body.color,
          transparent: true,
          opacity:
            body.surface === 'impact-remnant' ? 0.18 : body.surface === 'stellar-merger' ? 0.82 : 0.7,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      const glowScale =
        body.surface === 'impact-remnant' ? 2.05 : body.surface === 'stellar-merger' ? 4.5 : 3.6;
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
    if (
      this.blackHoleAppearance === undefined ||
      this.blackHoleDiskFrame === undefined ||
      this.blackHoleMaterial === undefined
    ) {
      return;
    }

    this.blackHoleAppearance.lookAt(cameraPosition);
    this.diskRotation.makeRotationFromQuaternion(this.blackHoleDiskFrame.quaternion);
    this.diskToWorld.setFromMatrix4(this.diskRotation);
    this.worldToDisk.copy(this.diskToWorld).transpose();
    this.cameraLocal
      .subVectors(cameraPosition, this.overlay.position)
      .applyMatrix3(this.worldToDisk)
      .divideScalar(this.body.renderRadius);
  }

  animate(elapsedSeconds: number): void {
    this.visualTime += elapsedSeconds;
    this.impactRemnantVisual?.update(elapsedSeconds);
    if (this.blackHoleMaterial !== undefined) {
      this.blackHoleMaterial.uniforms.uVisualTime!.value = this.visualTime;
    }
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

    if (this.blackHoleMaterial !== undefined) {
      this.blackHoleMaterial.uniforms.uDetail!.value =
        quality === 'high' ? 2 : quality === 'balanced' ? 1 : 0;
    }
    this.impactRemnantVisual?.setQuality(quality);
  }

  setSkyTexture(texture: Texture): void {
    if (this.blackHoleMaterial !== undefined) {
      this.blackHoleMaterial.uniforms.uSkyMap!.value = texture;
    }
  }

  dispose(): void {
    this.pickMesh.geometry.dispose();
    this.surfaceMaterial.dispose();
    this.atmosphere?.geometry.dispose();
    this.atmosphereMaterial?.dispose();
    this.ring?.geometry.dispose();
    this.ringMaterial?.dispose();
    this.impactRemnantVisual?.dispose();
    if (this.blackHoleMaterial !== undefined) {
      this.blackHoleResources?.unbind(this.blackHoleMaterial);
    }
    this.blackHoleAppearance?.geometry.dispose();
    this.blackHoleAppearance?.material.dispose();
    for (const mesh of this.decorativeMeshes) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => material.dispose());
      } else {
        mesh.material.dispose();
      }
    }
    for (const line of this.decorativeLines) {
      line.geometry.dispose();
      line.material.dispose();
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
    const magneticFrame = new Group();
    magneticFrame.rotation.z = includeBeams ? 0.56 : 0.28;
    const layout = createPulsarMagnetosphereLayout();
    const closedField = this.createMagneticLines(layout.closedField, 0x69cfff, 0.3);
    magneticFrame.add(closedField);

    if (includeBeams) {
      const openField = this.createMagneticLines(layout.openField, 0x9cddff, 0.24);
      const currentSheet = this.createMagneticLines(layout.currentSheet, 0xff6ba8, 0.34);
      magneticFrame.add(openField);
      this.compactField.add(currentSheet);

      for (const direction of [-1, 1]) {
        const beam = new Mesh(
          new ConeGeometry(0.72, 9.5, 32, 1, true),
          new ShaderMaterial({
            vertexShader: PULSAR_BEAM_VERTEX_SHADER,
            fragmentShader: PULSAR_BEAM_FRAGMENT_SHADER,
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false,
            side: DoubleSide,
            toneMapped: false,
          }),
        );
        beam.position.y = direction * 4.75;
        if (direction < 0) beam.rotation.z = Math.PI;
        beam.renderOrder = 4;
        magneticFrame.add(beam);
        this.decorativeMeshes.push(beam);

        const polarCap = new Mesh(
          new SphereGeometry(0.115, 16, 10),
          new MeshBasicMaterial({
            color: 0xe5f8ff,
            transparent: true,
            opacity: 0.96,
            blending: AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        polarCap.position.y = direction * 1.02;
        polarCap.renderOrder = 5;
        magneticFrame.add(polarCap);
        this.decorativeMeshes.push(polarCap);
      }
    }

    this.compactField.add(magneticFrame);
    this.oriented.add(this.compactField);
  }

  private createMagneticLines(
    positions: Float32Array,
    color: number,
    opacity: number,
  ): LineSegments<BufferGeometry, LineBasicMaterial> {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    const line = new LineSegments(
      geometry,
      new LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    line.renderOrder = 3;
    this.decorativeLines.push(line);
    return line;
  }

  private addQuasarJets(frame: Group): void {
    for (const direction of [-1, 1]) {
      const jet = new Mesh(
        new ConeGeometry(0.72, 12, 32, 1, true),
        new MeshBasicMaterial({
          color: 0xb5e9ff,
          transparent: true,
          opacity: 0.038,
          blending: AdditiveBlending,
          depthWrite: false,
          side: BackSide,
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
          opacity: 0.072,
          blending: AdditiveBlending,
          depthWrite: false,
          side: BackSide,
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
