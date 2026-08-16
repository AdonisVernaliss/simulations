import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  NearestFilter,
  RGFormat,
  ShaderMaterial,
} from 'three';

export interface FloatLookupData {
  readonly width: number;
  readonly height: number;
  readonly values: Float32Array;
}

export const decodeFloatLookup = (
  buffer: ArrayBuffer,
  expectedWidth: number,
  expectedHeight: number,
): FloatLookupData => {
  const data = new Float32Array(buffer);
  const width = data[0];
  const height = data[1];
  const expectedValues = expectedWidth * expectedHeight * 2;

  if (
    width !== expectedWidth ||
    height !== expectedHeight ||
    data.length !== expectedValues + 2
  ) {
    throw new RangeError('Unexpected Schwarzschild lookup-table dimensions.');
  }

  return {
    width,
    height,
    values: data.slice(2),
  };
};

interface LookupDefinition {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly texture: DataTexture;
}

const createPlaceholderTexture = (): DataTexture => {
  const texture = new DataTexture(new Float32Array(2), 1, 1, RGFormat, FloatType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
};

export class SchwarzschildBeamResources {
  readonly deflectionTexture = createPlaceholderTexture();
  readonly inverseRadiusTexture = createPlaceholderTexture();

  private readonly materials = new Set<ShaderMaterial>();
  private loading: Promise<void> | undefined;
  private disposed = false;

  bind(material: ShaderMaterial): void {
    material.uniforms.uRayDeflection!.value = this.deflectionTexture;
    material.uniforms.uRayInverseRadius!.value = this.inverseRadiusTexture;
    this.materials.add(material);
    this.loading ??= this.load();
  }

  unbind(material: ShaderMaterial): void {
    this.materials.delete(material);
  }

  dispose(): void {
    this.disposed = true;
    this.materials.clear();
    this.deflectionTexture.dispose();
    this.inverseRadiusTexture.dispose();
  }

  private async load(): Promise<void> {
    const definitions: readonly LookupDefinition[] = [
      {
        url: '/textures/black-hole/deflection.dat',
        width: 512,
        height: 512,
        texture: this.deflectionTexture,
      },
      {
        url: '/textures/black-hole/inverse-radius.dat',
        width: 64,
        height: 32,
        texture: this.inverseRadiusTexture,
      },
    ];

    try {
      await Promise.all(definitions.map((definition) => this.loadLookup(definition)));
      if (!this.disposed) {
        for (const material of this.materials) {
          material.uniforms.uBeamTracingReady!.value = 1;
        }
      }
    } catch {
      // The shader retains its bounded analytic fallback when an asset cannot load.
    }
  }

  private async loadLookup(definition: LookupDefinition): Promise<void> {
    const response = await fetch(definition.url);
    if (!response.ok) {
      throw new Error(`Unable to load ${definition.url}`);
    }
    const lookup = decodeFloatLookup(
      await response.arrayBuffer(),
      definition.width,
      definition.height,
    );
    if (this.disposed) {
      return;
    }
    definition.texture.image = {
      data: lookup.values,
      width: lookup.width,
      height: lookup.height,
    };
    definition.texture.needsUpdate = true;
  }
}
