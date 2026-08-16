export type GravityAlgorithm = 'direct' | 'barnes-hut';

export interface AdaptiveGravitySolverOptions {
  readonly directThreshold?: number;
  readonly openingAngle?: number;
}

const COMPONENTS_PER_BODY = 3;
const DEFAULT_DIRECT_THRESHOLD = 2_048;
const DEFAULT_OPENING_ANGLE = 0.5;
const LEAF_CAPACITY = 4;
const MAXIMUM_TREE_DEPTH = 24;

export const selectGravityAlgorithm = (
  bodyCount: number,
  directThreshold = DEFAULT_DIRECT_THRESHOLD,
): GravityAlgorithm => (bodyCount <= directThreshold ? 'direct' : 'barnes-hut');

export const computeDirectAccelerations = (
  positions: Float64Array,
  masses: Float64Array,
  gravitationalConstant: number,
  softening: number,
  target: Float64Array,
): void => {
  target.fill(0);
  const count = masses.length;
  const softenedDistanceSquared = softening * softening;

  for (let bodyIndex = 0; bodyIndex < count; bodyIndex += 1) {
    const offset = bodyIndex * COMPONENTS_PER_BODY;
    const x = positions[offset]!;
    const y = positions[offset + 1]!;
    const z = positions[offset + 2]!;
    const mass = masses[bodyIndex]!;

    for (let otherIndex = bodyIndex + 1; otherIndex < count; otherIndex += 1) {
      const otherOffset = otherIndex * COMPONENTS_PER_BODY;
      const deltaX = positions[otherOffset]! - x;
      const deltaY = positions[otherOffset + 1]! - y;
      const deltaZ = positions[otherOffset + 2]! - z;
      const squaredDistance =
        deltaX * deltaX +
        deltaY * deltaY +
        deltaZ * deltaZ +
        softenedDistanceSquared;
      const inverseDistanceCubed = 1 / (squaredDistance * Math.sqrt(squaredDistance));
      const bodyScale =
        gravitationalConstant * masses[otherIndex]! * inverseDistanceCubed;
      const otherScale = gravitationalConstant * mass * inverseDistanceCubed;

      target[offset] = target[offset]! + deltaX * bodyScale;
      target[offset + 1] = target[offset + 1]! + deltaY * bodyScale;
      target[offset + 2] = target[offset + 2]! + deltaZ * bodyScale;
      target[otherOffset] = target[otherOffset]! - deltaX * otherScale;
      target[otherOffset + 1] = target[otherOffset + 1]! - deltaY * otherScale;
      target[otherOffset + 2] = target[otherOffset + 2]! - deltaZ * otherScale;
    }
  }
};

class OctreeWorkspace {
  private capacity = 0;
  private nodeCount = 0;
  private centerX = new Float64Array();
  private centerY = new Float64Array();
  private centerZ = new Float64Array();
  private halfSize = new Float64Array();
  private nodeMass = new Float64Array();
  private centerOfMassX = new Float64Array();
  private centerOfMassY = new Float64Array();
  private centerOfMassZ = new Float64Array();
  private children = new Int32Array();
  private firstBody = new Int32Array();
  private bodyCount = new Int32Array();
  private internal = new Uint8Array();
  private nextBody = new Int32Array();
  private traversalStack = new Int32Array();

  compute(
    positions: Float64Array,
    masses: Float64Array,
    gravitationalConstant: number,
    softening: number,
    openingAngle: number,
    target: Float64Array,
  ): void {
    target.fill(0);
    if (masses.length < 2 || gravitationalConstant === 0) {
      return;
    }

    this.build(positions, masses, softening);
    const softenedDistanceSquared = softening * softening;

    for (let bodyIndex = 0; bodyIndex < masses.length; bodyIndex += 1) {
      const offset = bodyIndex * COMPONENTS_PER_BODY;
      const x = positions[offset]!;
      const y = positions[offset + 1]!;
      const z = positions[offset + 2]!;
      let accelerationX = 0;
      let accelerationY = 0;
      let accelerationZ = 0;
      let stackSize = 1;
      this.traversalStack[0] = 0;

      while (stackSize > 0) {
        stackSize -= 1;
        const nodeIndex = this.traversalStack[stackSize]!;
        if (this.internal[nodeIndex] === 0) {
          let otherIndex = this.firstBody[nodeIndex]!;
          while (otherIndex >= 0) {
            if (otherIndex !== bodyIndex) {
              const otherOffset = otherIndex * COMPONENTS_PER_BODY;
              const deltaX = positions[otherOffset]! - x;
              const deltaY = positions[otherOffset + 1]! - y;
              const deltaZ = positions[otherOffset + 2]! - z;
              const squaredDistance =
                deltaX * deltaX +
                deltaY * deltaY +
                deltaZ * deltaZ +
                softenedDistanceSquared;
              const inverseDistanceCubed =
                1 / (squaredDistance * Math.sqrt(squaredDistance));
              const scale =
                gravitationalConstant * masses[otherIndex]! * inverseDistanceCubed;
              accelerationX += deltaX * scale;
              accelerationY += deltaY * scale;
              accelerationZ += deltaZ * scale;
            }
            otherIndex = this.nextBody[otherIndex]!;
          }
          continue;
        }

        const deltaX = this.centerOfMassX[nodeIndex]! - x;
        const deltaY = this.centerOfMassY[nodeIndex]! - y;
        const deltaZ = this.centerOfMassZ[nodeIndex]! - z;
        const squaredDistance =
          deltaX * deltaX +
          deltaY * deltaY +
          deltaZ * deltaZ +
          softenedDistanceSquared;
        const halfSize = this.halfSize[nodeIndex]!;
        const containsBody =
          Math.abs(x - this.centerX[nodeIndex]!) <= halfSize &&
          Math.abs(y - this.centerY[nodeIndex]!) <= halfSize &&
          Math.abs(z - this.centerZ[nodeIndex]!) <= halfSize;
        const canApproximate =
          !containsBody &&
          (halfSize * 2) / Math.sqrt(squaredDistance) < openingAngle;

        if (canApproximate) {
          const inverseDistanceCubed =
            1 / (squaredDistance * Math.sqrt(squaredDistance));
          const scale =
            gravitationalConstant * this.nodeMass[nodeIndex]! * inverseDistanceCubed;
          accelerationX += deltaX * scale;
          accelerationY += deltaY * scale;
          accelerationZ += deltaZ * scale;
          continue;
        }

        const childOffset = nodeIndex * 8;
        for (let octant = 0; octant < 8; octant += 1) {
          const childIndex = this.children[childOffset + octant]!;
          if (childIndex >= 0) {
            this.traversalStack[stackSize] = childIndex;
            stackSize += 1;
          }
        }
      }

      target[offset] = accelerationX;
      target[offset + 1] = accelerationY;
      target[offset + 2] = accelerationZ;
    }

    this.removeCenterOfMassAcceleration(masses, target);
  }

  private build(
    positions: Float64Array,
    masses: Float64Array,
    softening: number,
  ): void {
    let minimumX = Number.POSITIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let minimumZ = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    let maximumZ = Number.NEGATIVE_INFINITY;

    for (let bodyIndex = 0; bodyIndex < masses.length; bodyIndex += 1) {
      const offset = bodyIndex * COMPONENTS_PER_BODY;
      const x = positions[offset]!;
      const y = positions[offset + 1]!;
      const z = positions[offset + 2]!;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      minimumZ = Math.min(minimumZ, z);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
      maximumZ = Math.max(maximumZ, z);
    }

    const centerX = (minimumX + maximumX) * 0.5;
    const centerY = (minimumY + maximumY) * 0.5;
    const centerZ = (minimumZ + maximumZ) * 0.5;
    const span = Math.max(maximumX - minimumX, maximumY - minimumY, maximumZ - minimumZ);
    const halfSize = span * 0.5000001 + Math.max(softening, 1e-12);
    this.nodeCount = 0;
    this.ensureBodyCapacity(masses.length);
    this.nextBody.fill(-1, 0, masses.length);
    this.createNode(centerX, centerY, centerZ, halfSize);

    for (let bodyIndex = 0; bodyIndex < masses.length; bodyIndex += 1) {
      this.insertBody(0, bodyIndex, 0, positions);
    }

    this.accumulateMass(masses, positions);
    if (this.traversalStack.length < this.nodeCount) {
      this.traversalStack = new Int32Array(this.capacity);
    }
  }

  private insertBody(
    nodeIndex: number,
    bodyIndex: number,
    depth: number,
    positions: Float64Array,
  ): void {
    if (this.internal[nodeIndex] !== 0) {
      this.insertIntoChild(nodeIndex, bodyIndex, depth, positions);
      return;
    }

    if (this.bodyCount[nodeIndex]! < LEAF_CAPACITY || depth >= MAXIMUM_TREE_DEPTH) {
      this.nextBody[bodyIndex] = this.firstBody[nodeIndex]!;
      this.firstBody[nodeIndex] = bodyIndex;
      this.bodyCount[nodeIndex] = this.bodyCount[nodeIndex]! + 1;
      return;
    }

    let previousBody = this.firstBody[nodeIndex]!;
    this.firstBody[nodeIndex] = -1;
    this.bodyCount[nodeIndex] = 0;
    this.internal[nodeIndex] = 1;

    while (previousBody >= 0) {
      const nextBody = this.nextBody[previousBody]!;
      this.nextBody[previousBody] = -1;
      this.insertIntoChild(nodeIndex, previousBody, depth, positions);
      previousBody = nextBody;
    }
    this.insertIntoChild(nodeIndex, bodyIndex, depth, positions);
  }

  private insertIntoChild(
    nodeIndex: number,
    bodyIndex: number,
    depth: number,
    positions: Float64Array,
  ): void {
    const bodyOffset = bodyIndex * COMPONENTS_PER_BODY;
    const positiveX = positions[bodyOffset]! >= this.centerX[nodeIndex]!;
    const positiveY = positions[bodyOffset + 1]! >= this.centerY[nodeIndex]!;
    const positiveZ = positions[bodyOffset + 2]! >= this.centerZ[nodeIndex]!;
    const octant = Number(positiveX) | (Number(positiveY) << 1) | (Number(positiveZ) << 2);
    const childOffset = nodeIndex * 8 + octant;
    let childIndex = this.children[childOffset]!;

    if (childIndex < 0) {
      const childHalfSize = this.halfSize[nodeIndex]! * 0.5;
      childIndex = this.createNode(
        this.centerX[nodeIndex]! + (positiveX ? childHalfSize : -childHalfSize),
        this.centerY[nodeIndex]! + (positiveY ? childHalfSize : -childHalfSize),
        this.centerZ[nodeIndex]! + (positiveZ ? childHalfSize : -childHalfSize),
        childHalfSize,
      );
      this.children[childOffset] = childIndex;
    }

    this.insertBody(childIndex, bodyIndex, depth + 1, positions);
  }

  private accumulateMass(masses: Float64Array, positions: Float64Array): void {
    for (let nodeIndex = this.nodeCount - 1; nodeIndex >= 0; nodeIndex -= 1) {
      let mass = 0;
      let weightedX = 0;
      let weightedY = 0;
      let weightedZ = 0;

      if (this.internal[nodeIndex] === 0) {
        let bodyIndex = this.firstBody[nodeIndex]!;
        while (bodyIndex >= 0) {
          const bodyMass = masses[bodyIndex]!;
          const bodyOffset = bodyIndex * COMPONENTS_PER_BODY;
          mass += bodyMass;
          weightedX += bodyMass * positions[bodyOffset]!;
          weightedY += bodyMass * positions[bodyOffset + 1]!;
          weightedZ += bodyMass * positions[bodyOffset + 2]!;
          bodyIndex = this.nextBody[bodyIndex]!;
        }
      } else {
        const childOffset = nodeIndex * 8;
        for (let octant = 0; octant < 8; octant += 1) {
          const childIndex = this.children[childOffset + octant]!;
          if (childIndex < 0) {
            continue;
          }
          const childMass = this.nodeMass[childIndex]!;
          mass += childMass;
          weightedX += childMass * this.centerOfMassX[childIndex]!;
          weightedY += childMass * this.centerOfMassY[childIndex]!;
          weightedZ += childMass * this.centerOfMassZ[childIndex]!;
        }
      }

      this.nodeMass[nodeIndex] = mass;
      this.centerOfMassX[nodeIndex] =
        mass > 0 ? weightedX / mass : this.centerX[nodeIndex]!;
      this.centerOfMassY[nodeIndex] =
        mass > 0 ? weightedY / mass : this.centerY[nodeIndex]!;
      this.centerOfMassZ[nodeIndex] =
        mass > 0 ? weightedZ / mass : this.centerZ[nodeIndex]!;
    }
  }

  private removeCenterOfMassAcceleration(
    masses: Float64Array,
    accelerations: Float64Array,
  ): void {
    let totalMass = 0;
    let weightedX = 0;
    let weightedY = 0;
    let weightedZ = 0;

    for (let bodyIndex = 0; bodyIndex < masses.length; bodyIndex += 1) {
      const mass = masses[bodyIndex]!;
      const offset = bodyIndex * COMPONENTS_PER_BODY;
      totalMass += mass;
      weightedX += mass * accelerations[offset]!;
      weightedY += mass * accelerations[offset + 1]!;
      weightedZ += mass * accelerations[offset + 2]!;
    }

    if (totalMass <= 0) {
      return;
    }

    const correctionX = weightedX / totalMass;
    const correctionY = weightedY / totalMass;
    const correctionZ = weightedZ / totalMass;
    for (let bodyIndex = 0; bodyIndex < masses.length; bodyIndex += 1) {
      const offset = bodyIndex * COMPONENTS_PER_BODY;
      accelerations[offset] = accelerations[offset]! - correctionX;
      accelerations[offset + 1] = accelerations[offset + 1]! - correctionY;
      accelerations[offset + 2] = accelerations[offset + 2]! - correctionZ;
    }
  }

  private createNode(centerX: number, centerY: number, centerZ: number, halfSize: number): number {
    this.ensureNodeCapacity(this.nodeCount + 1);
    const nodeIndex = this.nodeCount;
    this.nodeCount += 1;
    this.centerX[nodeIndex] = centerX;
    this.centerY[nodeIndex] = centerY;
    this.centerZ[nodeIndex] = centerZ;
    this.halfSize[nodeIndex] = halfSize;
    this.nodeMass[nodeIndex] = 0;
    this.centerOfMassX[nodeIndex] = centerX;
    this.centerOfMassY[nodeIndex] = centerY;
    this.centerOfMassZ[nodeIndex] = centerZ;
    this.firstBody[nodeIndex] = -1;
    this.bodyCount[nodeIndex] = 0;
    this.internal[nodeIndex] = 0;
    this.children.fill(-1, nodeIndex * 8, nodeIndex * 8 + 8);
    return nodeIndex;
  }

  private ensureBodyCapacity(bodyCount: number): void {
    if (this.nextBody.length < bodyCount) {
      this.nextBody = new Int32Array(bodyCount);
    }
  }

  private ensureNodeCapacity(requiredCapacity: number): void {
    if (requiredCapacity <= this.capacity) {
      return;
    }

    const nextCapacity = Math.max(64, this.capacity * 2, requiredCapacity);
    this.centerX = this.growFloatArray(this.centerX, nextCapacity);
    this.centerY = this.growFloatArray(this.centerY, nextCapacity);
    this.centerZ = this.growFloatArray(this.centerZ, nextCapacity);
    this.halfSize = this.growFloatArray(this.halfSize, nextCapacity);
    this.nodeMass = this.growFloatArray(this.nodeMass, nextCapacity);
    this.centerOfMassX = this.growFloatArray(this.centerOfMassX, nextCapacity);
    this.centerOfMassY = this.growFloatArray(this.centerOfMassY, nextCapacity);
    this.centerOfMassZ = this.growFloatArray(this.centerOfMassZ, nextCapacity);
    const nextChildren = new Int32Array(nextCapacity * 8);
    nextChildren.fill(-1);
    nextChildren.set(this.children);
    this.children = nextChildren;
    const nextFirstBody = new Int32Array(nextCapacity);
    nextFirstBody.fill(-1);
    nextFirstBody.set(this.firstBody);
    this.firstBody = nextFirstBody;
    this.bodyCount = this.growIntegerArray(this.bodyCount, nextCapacity);
    const nextInternal = new Uint8Array(nextCapacity);
    nextInternal.set(this.internal);
    this.internal = nextInternal;
    this.capacity = nextCapacity;
  }

  private growFloatArray(
    source: Float64Array<ArrayBuffer>,
    length: number,
  ): Float64Array<ArrayBuffer> {
    const output = new Float64Array(length);
    output.set(source);
    return output;
  }

  private growIntegerArray(
    source: Int32Array<ArrayBuffer>,
    length: number,
  ): Int32Array<ArrayBuffer> {
    const output = new Int32Array(length);
    output.set(source);
    return output;
  }
}

export class AdaptiveGravitySolver {
  private readonly directThreshold: number;
  private readonly openingAngle: number;
  private readonly octree = new OctreeWorkspace();
  private activeAlgorithm: GravityAlgorithm = 'direct';

  constructor(options: AdaptiveGravitySolverOptions = {}) {
    this.directThreshold = Math.max(
      0,
      Math.floor(options.directThreshold ?? DEFAULT_DIRECT_THRESHOLD),
    );
    this.openingAngle = options.openingAngle ?? DEFAULT_OPENING_ANGLE;

    if (!Number.isFinite(this.openingAngle) || this.openingAngle <= 0 || this.openingAngle > 1) {
      throw new RangeError('Barnes-Hut opening angle must be within (0, 1]');
    }
  }

  get algorithm(): GravityAlgorithm {
    return this.activeAlgorithm;
  }

  compute(
    positions: Float64Array,
    masses: Float64Array,
    gravitationalConstant: number,
    softening: number,
    target: Float64Array,
  ): void {
    if (positions.length !== masses.length * COMPONENTS_PER_BODY) {
      throw new RangeError('Position and mass arrays have incompatible lengths');
    }
    if (target.length !== positions.length) {
      throw new RangeError('Acceleration target has an incompatible length');
    }

    this.activeAlgorithm = selectGravityAlgorithm(masses.length, this.directThreshold);
    if (this.activeAlgorithm === 'direct') {
      computeDirectAccelerations(
        positions,
        masses,
        gravitationalConstant,
        softening,
        target,
      );
      return;
    }

    this.octree.compute(
      positions,
      masses,
      gravitationalConstant,
      softening,
      this.openingAngle,
      target,
    );
  }
}
