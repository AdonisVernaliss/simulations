export interface TidalDisruptionLayout {
  readonly positions: Float32Array;
  readonly sides: Float32Array;
  readonly progress: Float32Array;
  readonly phases: Float32Array;
  readonly sizes: Float32Array;
  readonly temperatures: Float32Array;
}

const pseudoRandom = (index: number, channel: number): number => {
  const value = Math.sin((index + 1) * 91.73 + (channel + 1) * 271.9) * 41_753.2381;
  return value - Math.floor(value);
};

export const createTidalDisruptionLayout = (count: number): TidalDisruptionLayout => {
  const safeCount = Math.max(0, Math.floor(count));
  const positions = new Float32Array(safeCount * 3);
  const sides = new Float32Array(safeCount);
  const progress = new Float32Array(safeCount);
  const phases = new Float32Array(safeCount);
  const sizes = new Float32Array(safeCount);
  const temperatures = new Float32Array(safeCount);

  for (let index = 0; index < safeCount; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const streamProgress = pseudoRandom(index, 0) ** 0.72;
    const angle = pseudoRandom(index, 1) * Math.PI * 2;
    const width = (0.055 + streamProgress * 0.38) * (0.24 + pseudoRandom(index, 2) * 0.76);
    const offset = index * 3;

    positions[offset] = side * (0.92 + streamProgress * 6.45);
    positions[offset + 1] = Math.cos(angle) * width;
    positions[offset + 2] = Math.sin(angle) * width;
    sides[index] = side;
    progress[index] = streamProgress;
    phases[index] = pseudoRandom(index, 3) * Math.PI * 2;
    sizes[index] = 0.025 + pseudoRandom(index, 4) * 0.065;
    temperatures[index] = Math.max(
      0,
      Math.min(1, 1.08 - streamProgress * 0.72 + (pseudoRandom(index, 5) - 0.5) * 0.2),
    );
  }

  return { positions, sides, progress, phases, sizes, temperatures };
};
