import type {
  BodyDefinition,
  SimulationDiagnostics,
  SimulationOptions,
  Vector3Tuple,
} from './types';

const COMPONENTS_PER_BODY = 3;

const assertFiniteVector = (value: Vector3Tuple, label: string): void => {
  if (value.some((component) => !Number.isFinite(component))) {
    throw new TypeError(`${label} must contain finite values`);
  }
};

const assertBody = (body: BodyDefinition): void => {
  if (!body.id.trim()) {
    throw new TypeError('Body id must not be empty');
  }

  if (!Number.isFinite(body.mass) || body.mass <= 0) {
    throw new RangeError(`Body ${body.id} must have a positive finite mass`);
  }

  if (!Number.isFinite(body.radius) || body.radius < 0) {
    throw new RangeError(`Body ${body.id} must have a non-negative finite radius`);
  }

  assertFiniteVector(body.position, `Body ${body.id} position`);
  assertFiniteVector(body.velocity, `Body ${body.id} velocity`);
};

export class NBodySimulation {
  readonly gravitationalConstant: number;
  readonly softening: number;
  readonly collisions: boolean;

  private idsData: string[] = [];
  private namesData: string[] = [];
  private colorsData: string[] = [];
  private massData = new Float64Array();
  private radiusData = new Float64Array();
  private positionData = new Float64Array();
  private velocityData = new Float64Array();
  private accelerationData = new Float64Array();
  private nextAccelerationData = new Float64Array();
  private elapsedTime = 0;

  constructor(bodies: readonly BodyDefinition[], options: SimulationOptions = {}) {
    this.gravitationalConstant = options.gravitationalConstant ?? 1;
    this.softening = options.softening ?? 0.001;
    this.collisions = options.collisions ?? false;

    if (!Number.isFinite(this.gravitationalConstant) || this.gravitationalConstant < 0) {
      throw new RangeError('Gravitational constant must be finite and non-negative');
    }

    if (!Number.isFinite(this.softening) || this.softening < 0) {
      throw new RangeError('Softening must be finite and non-negative');
    }

    this.replaceBodies(bodies);
  }

  get count(): number {
    return this.massData.length;
  }

  get time(): number {
    return this.elapsedTime;
  }

  get ids(): readonly string[] {
    return this.idsData;
  }

  get names(): readonly string[] {
    return this.namesData;
  }

  get colors(): readonly string[] {
    return this.colorsData;
  }

  get masses(): Float64Array {
    return this.massData;
  }

  get radii(): Float64Array {
    return this.radiusData;
  }

  get positions(): Float64Array {
    return this.positionData;
  }

  get velocities(): Float64Array {
    return this.velocityData;
  }

  addBody(body: BodyDefinition): void {
    this.replaceBodies([...this.createBodyDefinitions(), body]);
  }

  step(deltaTime: number): void {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      throw new RangeError('Time step must be positive and finite');
    }

    const halfDeltaSquared = 0.5 * deltaTime * deltaTime;

    for (let index = 0; index < this.positionData.length; index += 1) {
      this.positionData[index] =
        this.positionData[index]! +
        this.velocityData[index]! * deltaTime +
        this.accelerationData[index]! * halfDeltaSquared;
    }

    this.computeAccelerations(this.nextAccelerationData);

    for (let index = 0; index < this.velocityData.length; index += 1) {
      this.velocityData[index] =
        this.velocityData[index]! +
        0.5 * (this.accelerationData[index]! + this.nextAccelerationData[index]!) * deltaTime;
    }

    [this.accelerationData, this.nextAccelerationData] = [
      this.nextAccelerationData,
      this.accelerationData,
    ];

    this.elapsedTime += deltaTime;

    if (this.collisions && this.count > 1) {
      this.resolveCollisions();
    }
  }

  getDiagnostics(): SimulationDiagnostics {
    let kineticEnergy = 0;
    let potentialEnergy = 0;
    let totalMass = 0;
    let momentumX = 0;
    let momentumY = 0;
    let momentumZ = 0;
    let angularX = 0;
    let angularY = 0;
    let angularZ = 0;
    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;

    for (let bodyIndex = 0; bodyIndex < this.count; bodyIndex += 1) {
      const offset = bodyIndex * COMPONENTS_PER_BODY;
      const mass = this.massData[bodyIndex]!;
      const x = this.positionData[offset]!;
      const y = this.positionData[offset + 1]!;
      const z = this.positionData[offset + 2]!;
      const velocityX = this.velocityData[offset]!;
      const velocityY = this.velocityData[offset + 1]!;
      const velocityZ = this.velocityData[offset + 2]!;

      kineticEnergy +=
        0.5 * mass * (velocityX ** 2 + velocityY ** 2 + velocityZ ** 2);
      momentumX += mass * velocityX;
      momentumY += mass * velocityY;
      momentumZ += mass * velocityZ;
      angularX += mass * (y * velocityZ - z * velocityY);
      angularY += mass * (z * velocityX - x * velocityZ);
      angularZ += mass * (x * velocityY - y * velocityX);
      centerX += mass * x;
      centerY += mass * y;
      centerZ += mass * z;
      totalMass += mass;

      for (let otherIndex = bodyIndex + 1; otherIndex < this.count; otherIndex += 1) {
        const otherOffset = otherIndex * COMPONENTS_PER_BODY;
        const deltaX = this.positionData[otherOffset]! - x;
        const deltaY = this.positionData[otherOffset + 1]! - y;
        const deltaZ = this.positionData[otherOffset + 2]! - z;
        const distance = Math.sqrt(
          deltaX ** 2 + deltaY ** 2 + deltaZ ** 2 + this.softening ** 2,
        );

        potentialEnergy -=
          (this.gravitationalConstant * mass * this.massData[otherIndex]!) / distance;
      }
    }

    const centerOfMass: Vector3Tuple =
      totalMass === 0
        ? [0, 0, 0]
        : [centerX / totalMass, centerY / totalMass, centerZ / totalMass];

    return {
      kineticEnergy,
      potentialEnergy,
      totalEnergy: kineticEnergy + potentialEnergy,
      linearMomentum: [momentumX, momentumY, momentumZ],
      angularMomentum: [angularX, angularY, angularZ],
      centerOfMass,
    };
  }

  private replaceBodies(bodies: readonly BodyDefinition[]): void {
    const seenIds = new Set<string>();

    for (const body of bodies) {
      assertBody(body);
      if (seenIds.has(body.id)) {
        throw new TypeError(`Body id must be unique: ${body.id}`);
      }
      seenIds.add(body.id);
    }

    this.idsData = bodies.map((body) => body.id);
    this.namesData = bodies.map((body) => body.name);
    this.colorsData = bodies.map((body) => body.color);
    this.massData = new Float64Array(bodies.length);
    this.radiusData = new Float64Array(bodies.length);
    this.positionData = new Float64Array(bodies.length * COMPONENTS_PER_BODY);
    this.velocityData = new Float64Array(bodies.length * COMPONENTS_PER_BODY);
    this.accelerationData = new Float64Array(bodies.length * COMPONENTS_PER_BODY);
    this.nextAccelerationData = new Float64Array(bodies.length * COMPONENTS_PER_BODY);

    bodies.forEach((body, bodyIndex) => {
      const offset = bodyIndex * COMPONENTS_PER_BODY;
      this.massData[bodyIndex] = body.mass;
      this.radiusData[bodyIndex] = body.radius;

      for (let component = 0; component < COMPONENTS_PER_BODY; component += 1) {
        this.positionData[offset + component] = body.position[component]!;
        this.velocityData[offset + component] = body.velocity[component]!;
      }
    });

    this.computeAccelerations(this.accelerationData);
  }

  private computeAccelerations(target: Float64Array): void {
    target.fill(0);

    for (let bodyIndex = 0; bodyIndex < this.count; bodyIndex += 1) {
      const offset = bodyIndex * COMPONENTS_PER_BODY;

      for (let otherIndex = bodyIndex + 1; otherIndex < this.count; otherIndex += 1) {
        const otherOffset = otherIndex * COMPONENTS_PER_BODY;
        const deltaX = this.positionData[otherOffset]! - this.positionData[offset]!;
        const deltaY = this.positionData[otherOffset + 1]! - this.positionData[offset + 1]!;
        const deltaZ = this.positionData[otherOffset + 2]! - this.positionData[offset + 2]!;
        const squaredDistance =
          deltaX ** 2 + deltaY ** 2 + deltaZ ** 2 + this.softening ** 2;
        const inverseDistanceCubed = 1 / (squaredDistance * Math.sqrt(squaredDistance));
        const bodyScale =
          this.gravitationalConstant * this.massData[otherIndex]! * inverseDistanceCubed;
        const otherScale =
          this.gravitationalConstant * this.massData[bodyIndex]! * inverseDistanceCubed;

        target[offset] = target[offset]! + deltaX * bodyScale;
        target[offset + 1] = target[offset + 1]! + deltaY * bodyScale;
        target[offset + 2] = target[offset + 2]! + deltaZ * bodyScale;
        target[otherOffset] = target[otherOffset]! - deltaX * otherScale;
        target[otherOffset + 1] = target[otherOffset + 1]! - deltaY * otherScale;
        target[otherOffset + 2] = target[otherOffset + 2]! - deltaZ * otherScale;
      }
    }
  }

  private resolveCollisions(): void {
    let collisionFound = true;

    while (collisionFound) {
      collisionFound = false;

      collisionSearch: for (let bodyIndex = 0; bodyIndex < this.count; bodyIndex += 1) {
        const offset = bodyIndex * COMPONENTS_PER_BODY;

        for (let otherIndex = bodyIndex + 1; otherIndex < this.count; otherIndex += 1) {
          const otherOffset = otherIndex * COMPONENTS_PER_BODY;
          const deltaX = this.positionData[otherOffset]! - this.positionData[offset]!;
          const deltaY = this.positionData[otherOffset + 1]! - this.positionData[offset + 1]!;
          const deltaZ = this.positionData[otherOffset + 2]! - this.positionData[offset + 2]!;
          const combinedRadius = this.radiusData[bodyIndex]! + this.radiusData[otherIndex]!;

          if (deltaX ** 2 + deltaY ** 2 + deltaZ ** 2 <= combinedRadius ** 2) {
            this.mergePair(bodyIndex, otherIndex);
            collisionFound = true;
            break collisionSearch;
          }
        }
      }
    }
  }

  private mergePair(firstIndex: number, secondIndex: number): void {
    const firstMass = this.massData[firstIndex]!;
    const secondMass = this.massData[secondIndex]!;
    const combinedMass = firstMass + secondMass;
    const firstOffset = firstIndex * COMPONENTS_PER_BODY;
    const secondOffset = secondIndex * COMPONENTS_PER_BODY;
    const mergedPosition: number[] = [];
    const mergedVelocity: number[] = [];

    for (let component = 0; component < COMPONENTS_PER_BODY; component += 1) {
      mergedPosition.push(
        (this.positionData[firstOffset + component]! * firstMass +
          this.positionData[secondOffset + component]! * secondMass) /
          combinedMass,
      );
      mergedVelocity.push(
        (this.velocityData[firstOffset + component]! * firstMass +
          this.velocityData[secondOffset + component]! * secondMass) /
          combinedMass,
      );
    }

    const mergedBody: BodyDefinition = {
      id: `${this.idsData[firstIndex]}+${this.idsData[secondIndex]}`,
      name: `${this.namesData[firstIndex]} + ${this.namesData[secondIndex]}`,
      mass: combinedMass,
      radius: Math.cbrt(
        this.radiusData[firstIndex]! ** 3 + this.radiusData[secondIndex]! ** 3,
      ),
      color:
        firstMass >= secondMass ? this.colorsData[firstIndex]! : this.colorsData[secondIndex]!,
      position: [mergedPosition[0]!, mergedPosition[1]!, mergedPosition[2]!],
      velocity: [mergedVelocity[0]!, mergedVelocity[1]!, mergedVelocity[2]!],
    };

    const remainingBodies: BodyDefinition[] = [];

    for (let bodyIndex = 0; bodyIndex < this.count; bodyIndex += 1) {
      if (bodyIndex === firstIndex) {
        remainingBodies.push(mergedBody);
      } else if (bodyIndex !== secondIndex) {
        const offset = bodyIndex * COMPONENTS_PER_BODY;
        remainingBodies.push({
          id: this.idsData[bodyIndex]!,
          name: this.namesData[bodyIndex]!,
          mass: this.massData[bodyIndex]!,
          radius: this.radiusData[bodyIndex]!,
          color: this.colorsData[bodyIndex]!,
          position: [
            this.positionData[offset]!,
            this.positionData[offset + 1]!,
            this.positionData[offset + 2]!,
          ],
          velocity: [
            this.velocityData[offset]!,
            this.velocityData[offset + 1]!,
            this.velocityData[offset + 2]!,
          ],
        });
      }
    }

    this.replaceBodies(remainingBodies);
  }

  private createBodyDefinitions(): BodyDefinition[] {
    const bodies: BodyDefinition[] = [];

    for (let bodyIndex = 0; bodyIndex < this.count; bodyIndex += 1) {
      const offset = bodyIndex * COMPONENTS_PER_BODY;
      bodies.push({
        id: this.idsData[bodyIndex]!,
        name: this.namesData[bodyIndex]!,
        mass: this.massData[bodyIndex]!,
        radius: this.radiusData[bodyIndex]!,
        color: this.colorsData[bodyIndex]!,
        position: [
          this.positionData[offset]!,
          this.positionData[offset + 1]!,
          this.positionData[offset + 2]!,
        ],
        velocity: [
          this.velocityData[offset]!,
          this.velocityData[offset + 1]!,
          this.velocityData[offset + 2]!,
        ],
      });
    }

    return bodies;
  }
}
