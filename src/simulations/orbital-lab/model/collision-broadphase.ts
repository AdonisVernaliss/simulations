export type CollisionBroadphaseAlgorithm = 'direct' | 'sweep-and-prune';

export interface CollisionBroadphaseOptions {
  readonly directThreshold?: number;
}

const COMPONENTS_PER_BODY = 3;
const DEFAULT_DIRECT_THRESHOLD = 48;

export class CollisionBroadphase {
  private readonly directThreshold: number;
  private order: Int32Array<ArrayBuffer> = new Int32Array();
  private activeAlgorithm: CollisionBroadphaseAlgorithm = 'direct';

  constructor(options: CollisionBroadphaseOptions = {}) {
    const directThreshold = options.directThreshold ?? DEFAULT_DIRECT_THRESHOLD;
    if (!Number.isFinite(directThreshold) || directThreshold < 0) {
      throw new RangeError('Collision broad-phase threshold must be finite and non-negative');
    }
    this.directThreshold = Math.floor(directThreshold);
  }

  get algorithm(): CollisionBroadphaseAlgorithm {
    return this.activeAlgorithm;
  }

  findFirst(
    positions: Float64Array,
    radii: Float64Array,
  ): readonly [number, number] | undefined {
    if (positions.length !== radii.length * COMPONENTS_PER_BODY) {
      throw new RangeError('Position and radius arrays have incompatible lengths');
    }

    if (radii.length <= this.directThreshold) {
      this.activeAlgorithm = 'direct';
      return this.findDirect(positions, radii);
    }

    this.activeAlgorithm = 'sweep-and-prune';
    return this.findWithSweep(positions, radii);
  }

  private findDirect(
    positions: Float64Array,
    radii: Float64Array,
  ): readonly [number, number] | undefined {
    for (let firstIndex = 0; firstIndex < radii.length; firstIndex += 1) {
      const firstOffset = firstIndex * COMPONENTS_PER_BODY;
      const firstX = positions[firstOffset]!;
      const firstY = positions[firstOffset + 1]!;
      const firstZ = positions[firstOffset + 2]!;

      for (let secondIndex = firstIndex + 1; secondIndex < radii.length; secondIndex += 1) {
        const secondOffset = secondIndex * COMPONENTS_PER_BODY;
        const deltaX = positions[secondOffset]! - firstX;
        const deltaY = positions[secondOffset + 1]! - firstY;
        const deltaZ = positions[secondOffset + 2]! - firstZ;
        const combinedRadius = radii[firstIndex]! + radii[secondIndex]!;
        if (
          deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ <=
          combinedRadius * combinedRadius
        ) {
          return [firstIndex, secondIndex];
        }
      }
    }

    return undefined;
  }

  private findWithSweep(
    positions: Float64Array,
    radii: Float64Array,
  ): readonly [number, number] | undefined {
    this.ensureOrderCapacity(radii.length);
    for (let bodyIndex = 0; bodyIndex < radii.length; bodyIndex += 1) {
      this.order[bodyIndex] = bodyIndex;
    }
    const activeOrder = this.order.subarray(0, radii.length);
    activeOrder.sort((leftIndex, rightIndex) => {
      const leftMinimum = positions[leftIndex * COMPONENTS_PER_BODY]! - radii[leftIndex]!;
      const rightMinimum = positions[rightIndex * COMPONENTS_PER_BODY]! - radii[rightIndex]!;
      return leftMinimum - rightMinimum || leftIndex - rightIndex;
    });

    let bestFirst = Number.MAX_SAFE_INTEGER;
    let bestSecond = Number.MAX_SAFE_INTEGER;

    for (let orderIndex = 0; orderIndex < activeOrder.length; orderIndex += 1) {
      const bodyIndex = activeOrder[orderIndex]!;
      const bodyOffset = bodyIndex * COMPONENTS_PER_BODY;
      const bodyRadius = radii[bodyIndex]!;
      const maximumX = positions[bodyOffset]! + bodyRadius;

      for (
        let otherOrderIndex = orderIndex + 1;
        otherOrderIndex < activeOrder.length;
        otherOrderIndex += 1
      ) {
        const otherIndex = activeOrder[otherOrderIndex]!;
        const otherOffset = otherIndex * COMPONENTS_PER_BODY;
        const otherRadius = radii[otherIndex]!;
        if (positions[otherOffset]! - otherRadius > maximumX) {
          break;
        }

        const combinedRadius = bodyRadius + otherRadius;
        const deltaY = positions[otherOffset + 1]! - positions[bodyOffset + 1]!;
        if (Math.abs(deltaY) > combinedRadius) {
          continue;
        }
        const deltaZ = positions[otherOffset + 2]! - positions[bodyOffset + 2]!;
        if (Math.abs(deltaZ) > combinedRadius) {
          continue;
        }
        const deltaX = positions[otherOffset]! - positions[bodyOffset]!;
        if (
          deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ >
          combinedRadius * combinedRadius
        ) {
          continue;
        }

        const firstIndex = Math.min(bodyIndex, otherIndex);
        const secondIndex = Math.max(bodyIndex, otherIndex);
        if (
          firstIndex < bestFirst ||
          (firstIndex === bestFirst && secondIndex < bestSecond)
        ) {
          bestFirst = firstIndex;
          bestSecond = secondIndex;
        }
      }
    }

    return bestFirst === Number.MAX_SAFE_INTEGER ? undefined : [bestFirst, bestSecond];
  }

  private ensureOrderCapacity(bodyCount: number): void {
    if (this.order.length < bodyCount) {
      this.order = new Int32Array(bodyCount);
    }
  }
}
