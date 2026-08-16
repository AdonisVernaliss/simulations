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

const BLACK_HOLE_VERTEX_SHADER = `
  varying vec2 vUvPosition;

  void main() {
    vUvPosition = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BLACK_HOLE_FRAGMENT_SHADER = `
  uniform float uTime;
  varying vec2 vUvPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 p = vUvPosition;
    float radius = length(p);
    float angle = atan(p.y, p.x);

    // A thin inclined disk: the outer annuli are amber and the hotter inner edge is pale.
    float diskRadius = length(vec2(p.x, p.y / 0.105));
    float diskWindow = smoothstep(0.29, 0.34, diskRadius) * (1.0 - smoothstep(0.82, 0.98, diskRadius));
    float diskStriation = 0.78 + 0.22 * sin(diskRadius * 86.0 - uTime * 1.6 + hash(floor(p * 90.0)) * 2.5);
    float primaryDisk = diskWindow * diskStriation;

    // Far-side disk light appears above and below the shadow after strong lensing.
    float lensedRadius = 0.345 + 0.028 * cos(angle * 2.0);
    float lensedArc = exp(-abs(radius - lensedRadius) * 95.0);
    lensedArc *= smoothstep(0.055, 0.19, abs(p.y));
    lensedArc *= 0.62 + 0.38 * smoothstep(0.0, 0.7, abs(p.x));

    float photonRing = exp(-abs(radius - 0.274) * 190.0);
    float heat = 1.0 - smoothstep(0.28, 0.96, max(diskRadius, radius));
    float approaching = mix(0.46, 1.18, smoothstep(-0.9, 0.9, p.x));
    vec3 outerColor = vec3(0.92, 0.34, 0.075);
    vec3 innerColor = vec3(1.0, 0.95, 0.78);
    vec3 diskColor = mix(outerColor, innerColor, heat) * approaching;
    vec3 ringColor = mix(vec3(1.0, 0.58, 0.22), vec3(0.88, 0.94, 1.0), smoothstep(-0.7, 0.8, p.x));

    float shadow = 1.0 - smoothstep(0.245, 0.258, radius);
    float emission = max(primaryDisk, max(lensedArc, photonRing));
    vec3 color = diskColor * (primaryDisk + lensedArc * 0.86) + ringColor * photonRing * 1.3;
    color *= 1.0 - shadow;
    float alpha = max(shadow, clamp(emission, 0.0, 1.0));
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(color, alpha);
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
  private readonly surfaceMaterial: Material;
  private readonly atmosphereMaterial: MeshBasicMaterial | undefined;
  private readonly ringMaterial: Material | undefined;
  private atmosphere: Mesh<SphereGeometry, MeshBasicMaterial> | undefined;
  private ring: Mesh<RingGeometry, Material> | undefined;
  private blackHoleAppearance: Mesh<PlaneGeometry, ShaderMaterial> | undefined;
  private compactField: Group | undefined;
  private readonly decorativeMeshes: Mesh[] = [];
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
    this.root.add(this.oriented);
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
        uniforms: { uTime: { value: 0 } },
        vertexShader: BLACK_HOLE_VERTEX_SHADER,
        fragmentShader: BLACK_HOLE_FRAGMENT_SHADER,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        toneMapped: false,
      });
      this.blackHoleAppearance = new Mesh(new PlaneGeometry(8, 8), appearanceMaterial);
      this.blackHoleAppearance.renderOrder = 3;
      this.overlay.add(this.blackHoleAppearance);

      if (body.surface === 'quasar') {
        this.addQuasarJets();
      }
    }

    if (body.kind === 'neutron-star' || body.kind === 'pulsar') {
      this.addCompactStarField(body.kind === 'pulsar');
    }

    if (body.kind === 'star') {
      const glow = new Sprite(
        new SpriteMaterial({
          map: glowTexture,
          color: body.color,
          transparent: true,
          opacity: 0.7,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      glow.scale.set(3.6, 3.6, 1);
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

    if (this.blackHoleAppearance !== undefined) {
      const timeUniform = this.blackHoleAppearance.material.uniforms.uTime;
      if (timeUniform !== undefined) {
        timeUniform.value = time;
      }
    }
  }

  faceCamera(cameraPosition: Vector3): void {
    this.blackHoleAppearance?.lookAt(cameraPosition);
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
      const isBlackHole = this.body.kind === 'black-hole';
      this.ring.geometry.dispose();
      this.ring.geometry = this.createRingGeometry(
        isBlackHole ? 1.65 : 1.35,
        isBlackHole ? 3.9 : 2.28,
      );
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
            opacity: 0.17,
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

  private addQuasarJets(): void {
    const jets = new Group();
    jets.rotation.x = Math.PI / 2;
    for (const direction of [-1, 1]) {
      const jet = new Mesh(
        new ConeGeometry(0.42, 11, 28, 1, true),
        new MeshBasicMaterial({
          color: 0xaad8ff,
          transparent: true,
          opacity: 0.12,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
          toneMapped: false,
        }),
      );
      jet.position.y = direction * 5.5;
      if (direction < 0) jet.rotation.z = Math.PI;
      jets.add(jet);
      this.decorativeMeshes.push(jet);
    }
    this.overlay.add(jets);
  }
}
