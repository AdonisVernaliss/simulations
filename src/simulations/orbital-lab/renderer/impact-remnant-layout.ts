export interface ImpactDebrisLayout {
  readonly positions: Float32Array;
  readonly temperatures: Float32Array;
  readonly sizes: Float32Array;
  readonly phases: Float32Array;
}

const pseudoRandom = (index: number, channel: number): number => {
  const value = Math.sin((index + 1) * 127.1 + (channel + 1) * 311.7) * 43_758.5453;
  return value - Math.floor(value);
};

export const createImpactDebrisLayout = (count: number): ImpactDebrisLayout => {
  const safeCount = Math.max(0, Math.floor(count));
  const positions = new Float32Array(safeCount * 3);
  const temperatures = new Float32Array(safeCount);
  const sizes = new Float32Array(safeCount);
  const phases = new Float32Array(safeCount);

  for (let index = 0; index < safeCount; index += 1) {
    const radialFraction = pseudoRandom(index, 0) ** 0.72;
    const radius = 1.3 + radialFraction * 2.35;
    const phase = pseudoRandom(index, 1) * Math.PI * 2 + radius * 0.58;
    const thickness = 0.13 + (radius / 3.65) * 0.24;
    const height = (pseudoRandom(index, 2) - 0.5) * thickness;
    const offset = index * 3;
    positions[offset] = Math.cos(phase) * radius;
    positions[offset + 1] = height;
    positions[offset + 2] = Math.sin(phase) * radius;
    temperatures[index] = Math.max(
      0,
      Math.min(1, 1.08 - radialFraction * 0.9 + (pseudoRandom(index, 3) - 0.5) * 0.22),
    );
    sizes[index] = 0.022 + pseudoRandom(index, 4) * 0.055;
    phases[index] = pseudoRandom(index, 5) * Math.PI * 2;
  }

  return { positions, temperatures, sizes, phases };
};
