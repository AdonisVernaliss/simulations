import type {
  BodyDefinition,
  BodyKind,
  BodySurface,
  CollisionEvent,
  SimulationDiagnostics,
  SimulationOptions,
  Vector3Tuple,
} from './types';
import { analyzeCollision, type CollisionAnalysis } from './collision-model';

const COMPONENTS_PER_BODY = 3;
const MAXIMUM_INTERACTIVE_BODIES = 128;

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

  if (
    body.renderRadius !== undefined &&
    (!Number.isFinite(body.renderRadius) || body.renderRadius < 0)
  ) {
    throw new RangeError(`Body ${body.id} must have a non-negative finite render radius`);
  }

  if (body.axialTilt !== undefined && !Number.isFinite(body.axialTilt)) {
    throw new RangeError(`Body ${body.id} must have a finite axial tilt`);
  }

  if (body.rotationRate !== undefined && !Number.isFinite(body.rotationRate)) {
    throw new RangeError(`Body ${body.id} must have a finite rotation rate`);
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
  private kindsData: BodyKind[] = [];
  private surfacesData: BodySurface[] = [];
  private massData = new Float64Array();
  private radiusData = new Float64Array();
  private renderRadiusData = new Float64Array();
  private axialTiltData = new Float64Array();
  private rotationRateData = new Float64Array();
  private positionData = new Float64Array();
  private velocityData = new Float64Array();
  private accelerationData = new Float64Array();
  private nextAccelerationData = new Float64Array();
  private elapsedTime = 0;
  private collisionSequence = 0;
  private lastCollisionEventData: CollisionEvent | undefined;

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

  get kinds(): readonly BodyKind[] {
    return this.kindsData;
  }

  get surfaces(): readonly BodySurface[] {
    return this.surfacesData;
  }

  get masses(): Float64Array {
    return this.massData;
  }

  get radii(): Float64Array {
    return this.radiusData;
  }

  get renderRadii(): Float64Array {
    return this.renderRadiusData;
  }

  get axialTilts(): Float64Array {
    return this.axialTiltData;
  }

  get rotationRates(): Float64Array {
    return this.rotationRateData;
  }

  get positions(): Float64Array {
    return this.positionData;
  }

  get velocities(): Float64Array {
    return this.velocityData;
  }

  get lastCollisionEvent(): CollisionEvent | undefined {
    return this.lastCollisionEventData;
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
    this.kindsData = bodies.map((body) => body.kind ?? 'generic');
    this.surfacesData = bodies.map((body) => body.surface ?? 'procedural');
    this.massData = new Float64Array(bodies.length);
    this.radiusData = new Float64Array(bodies.length);
    this.renderRadiusData = new Float64Array(bodies.length);
    this.axialTiltData = new Float64Array(bodies.length);
    this.rotationRateData = new Float64Array(bodies.length);
    this.positionData = new Float64Array(bodies.length * COMPONENTS_PER_BODY);
    this.velocityData = new Float64Array(bodies.length * COMPONENTS_PER_BODY);
    this.accelerationData = new Float64Array(bodies.length * COMPONENTS_PER_BODY);
    this.nextAccelerationData = new Float64Array(bodies.length * COMPONENTS_PER_BODY);

    bodies.forEach((body, bodyIndex) => {
      const offset = bodyIndex * COMPONENTS_PER_BODY;
      this.massData[bodyIndex] = body.mass;
      this.radiusData[bodyIndex] = body.radius;
      this.renderRadiusData[bodyIndex] = body.renderRadius ?? body.radius;
      this.axialTiltData[bodyIndex] = body.axialTilt ?? 0;
      this.rotationRateData[bodyIndex] = body.rotationRate ?? 0;

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
    for (let bodyIndex = 0; bodyIndex < this.count; bodyIndex += 1) {
      const offset = bodyIndex * COMPONENTS_PER_BODY;

      for (let otherIndex = bodyIndex + 1; otherIndex < this.count; otherIndex += 1) {
        const otherOffset = otherIndex * COMPONENTS_PER_BODY;
        const relativePosition: Vector3Tuple = [
          this.positionData[otherOffset]! - this.positionData[offset]!,
          this.positionData[otherOffset + 1]! - this.positionData[offset + 1]!,
          this.positionData[otherOffset + 2]! - this.positionData[offset + 2]!,
        ];
        const combinedRadius = this.radiusData[bodyIndex]! + this.radiusData[otherIndex]!;

        if (Math.hypot(...relativePosition) > combinedRadius) {
          continue;
        }

        const analysis = analyzeCollision({
          firstMass: this.massData[bodyIndex]!,
          secondMass: this.massData[otherIndex]!,
          firstRadius: this.radiusData[bodyIndex]!,
          secondRadius: this.radiusData[otherIndex]!,
          firstKind: this.kindsData[bodyIndex]!,
          secondKind: this.kindsData[otherIndex]!,
          relativePosition,
          relativeVelocity: [
            this.velocityData[otherOffset]! - this.velocityData[offset]!,
            this.velocityData[otherOffset + 1]! - this.velocityData[offset + 1]!,
            this.velocityData[otherOffset + 2]! - this.velocityData[offset + 2]!,
          ],
          gravitationalConstant: this.gravitationalConstant,
        });
        const participants: readonly [string, string] = [
          this.idsData[bodyIndex]!,
          this.idsData[otherIndex]!,
        ];

        if (analysis.outcome === 'hit-and-run') {
          this.resolveHitAndRun(bodyIndex, otherIndex, relativePosition);
          this.recordCollision(participants, analysis, 0);
        } else if (analysis.outcome === 'disruption') {
          const fragmentCount = this.disruptPair(bodyIndex, otherIndex, analysis);
          this.recordCollision(participants, analysis, fragmentCount);
        } else {
          this.recordCollision(participants, analysis, 1);
          this.mergePair(bodyIndex, otherIndex, analysis);
        }
        return;
      }
    }
  }

  private mergePair(
    firstIndex: number,
    secondIndex: number,
    analysis?: CollisionAnalysis,
  ): void {
    const firstMass = this.massData[firstIndex]!;
    const secondMass = this.massData[secondIndex]!;
    const combinedMass = firstMass + secondMass;
    const finalMass = combinedMass - (analysis?.radiatedMass ?? 0);
    const firstOffset = firstIndex * COMPONENTS_PER_BODY;
    const secondOffset = secondIndex * COMPONENTS_PER_BODY;
    const mergedPosition: number[] = [];
    const mergedVelocity: number[] = [];
    const dominantIndex = firstMass >= secondMass ? firstIndex : secondIndex;
    const mergedKind =
      this.kindsData[firstIndex] === 'black-hole' ||
      this.kindsData[secondIndex] === 'black-hole'
        ? 'black-hole'
        : this.kindsData[dominantIndex]!;

    for (let component = 0; component < COMPONENTS_PER_BODY; component += 1) {
      mergedPosition.push(
        (this.positionData[firstOffset + component]! * firstMass +
          this.positionData[secondOffset + component]! * secondMass) /
          combinedMass,
      );
      mergedVelocity.push(
        (this.velocityData[firstOffset + component]! * firstMass +
          this.velocityData[secondOffset + component]! * secondMass) /
          finalMass,
      );
    }

    const mergedBody: BodyDefinition = {
      id: `${this.idsData[firstIndex]}+${this.idsData[secondIndex]}`,
      name: `${this.namesData[firstIndex]} + ${this.namesData[secondIndex]}`,
      kind: mergedKind,
      surface: mergedKind === 'black-hole' ? 'none' : this.surfacesData[dominantIndex]!,
      mass: finalMass,
      radius:
        mergedKind === 'black-hole'
          ? this.getMergedBlackHoleRadius(firstIndex, secondIndex, finalMass)
          : Math.cbrt(
              this.radiusData[firstIndex]! ** 3 + this.radiusData[secondIndex]! ** 3,
            ),
      renderRadius: Math.cbrt(
        this.renderRadiusData[firstIndex]! ** 3 + this.renderRadiusData[secondIndex]! ** 3,
      ),
      color: this.colorsData[dominantIndex]!,
      axialTilt: this.axialTiltData[dominantIndex]!,
      rotationRate: this.rotationRateData[dominantIndex]!,
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
          kind: this.kindsData[bodyIndex]!,
          surface: this.surfacesData[bodyIndex]!,
          mass: this.massData[bodyIndex]!,
          radius: this.radiusData[bodyIndex]!,
          renderRadius: this.renderRadiusData[bodyIndex]!,
          color: this.colorsData[bodyIndex]!,
          axialTilt: this.axialTiltData[bodyIndex]!,
          rotationRate: this.rotationRateData[bodyIndex]!,
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

  private resolveHitAndRun(
    firstIndex: number,
    secondIndex: number,
    relativePosition: Vector3Tuple,
  ): void {
    const firstOffset = firstIndex * COMPONENTS_PER_BODY;
    const secondOffset = secondIndex * COMPONENTS_PER_BODY;
    const distance = Math.max(Math.hypot(...relativePosition), Number.EPSILON);
    const normal = relativePosition.map((component) => component / distance) as unknown as Vector3Tuple;
    const relativeVelocity: Vector3Tuple = [
      this.velocityData[secondOffset]! - this.velocityData[firstOffset]!,
      this.velocityData[secondOffset + 1]! - this.velocityData[firstOffset + 1]!,
      this.velocityData[secondOffset + 2]! - this.velocityData[firstOffset + 2]!,
    ];
    const normalSpeed =
      relativeVelocity[0] * normal[0] +
      relativeVelocity[1] * normal[1] +
      relativeVelocity[2] * normal[2];
    const firstMass = this.massData[firstIndex]!;
    const secondMass = this.massData[secondIndex]!;

    if (normalSpeed < 0) {
      const restitution = 0.22;
      const impulse =
        (-(1 + restitution) * normalSpeed) / (1 / firstMass + 1 / secondMass);
      for (let component = 0; component < COMPONENTS_PER_BODY; component += 1) {
        this.velocityData[firstOffset + component] =
          this.velocityData[firstOffset + component]! -
          (impulse * normal[component]!) / firstMass;
        this.velocityData[secondOffset + component] =
          this.velocityData[secondOffset + component]! +
          (impulse * normal[component]!) / secondMass;
      }
    }

    const targetDistance =
      (this.radiusData[firstIndex]! + this.radiusData[secondIndex]!) * 1.0001;
    const overlap = Math.max(0, targetDistance - distance);
    const totalMass = firstMass + secondMass;
    for (let component = 0; component < COMPONENTS_PER_BODY; component += 1) {
      this.positionData[firstOffset + component] =
        this.positionData[firstOffset + component]! -
        normal[component]! * overlap * (secondMass / totalMass);
      this.positionData[secondOffset + component] =
        this.positionData[secondOffset + component]! +
        normal[component]! * overlap * (firstMass / totalMass);
    }
    this.computeAccelerations(this.accelerationData);
  }

  private disruptPair(
    firstIndex: number,
    secondIndex: number,
    analysis: CollisionAnalysis,
  ): number {
    const firstMass = this.massData[firstIndex]!;
    const secondMass = this.massData[secondIndex]!;
    const totalMass = firstMass + secondMass;
    const firstOffset = firstIndex * COMPONENTS_PER_BODY;
    const secondOffset = secondIndex * COMPONENTS_PER_BODY;
    const centerPosition: number[] = [];
    const centerVelocity: number[] = [];

    for (let component = 0; component < COMPONENTS_PER_BODY; component += 1) {
      centerPosition.push(
        (this.positionData[firstOffset + component]! * firstMass +
          this.positionData[secondOffset + component]! * secondMass) /
          totalMass,
      );
      centerVelocity.push(
        (this.velocityData[firstOffset + component]! * firstMass +
          this.velocityData[secondOffset + component]! * secondMass) /
          totalMass,
      );
    }

    const largestFraction = Math.max(0.1, Math.min(0.5, 1 - 0.5 * analysis.energyRatio));
    const largestMass = totalMass * largestFraction;
    const availableSlots =
      MAXIMUM_INTERACTIVE_BODIES - (this.count - 2) - 1;
    const debrisCount = Math.max(1, Math.min(8, availableSlots));
    const debrisWeights = Array.from(
      { length: debrisCount },
      (_, fragmentIndex) => 1 / (fragmentIndex + 1) ** 0.72,
    );
    const debrisWeightTotal = debrisWeights.reduce((sum, weight) => sum + weight, 0);
    const debrisMasses = debrisWeights.map(
      (weight) => ((totalMass - largestMass) * weight) / debrisWeightTotal,
    );
    const combinedRadius = Math.cbrt(
      this.radiusData[firstIndex]! ** 3 + this.radiusData[secondIndex]! ** 3,
    );
    const combinedRenderRadius = Math.cbrt(
      this.renderRadiusData[firstIndex]! ** 3 + this.renderRadiusData[secondIndex]! ** 3,
    );
    const dominantIndex = firstMass >= secondMass ? firstIndex : secondIndex;
    const eventSequence = this.collisionSequence + 1;
    const ejectionSpeed = Math.max(
      analysis.mutualEscapeSpeed * 0.32,
      analysis.impactSpeed * 0.12,
    );
    const separation = combinedRadius * 3.2;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const fragments = debrisMasses.map((mass, fragmentIndex) => {
      const variation =
        Math.sin((fragmentIndex + 1) * 91.733 + eventSequence * 17.17) * 43_758.5453;
      const random = variation - Math.floor(variation);
      const angle = fragmentIndex * goldenAngle + random * 0.42;
      const rawDirection: Vector3Tuple = [
        Math.cos(angle),
        Math.sin(angle),
        Math.sin(angle * 1.73 + 0.4) * 0.28,
      ];
      const directionLength = Math.hypot(...rawDirection);
      const direction = rawDirection.map(
        (component) => component / directionLength,
      ) as unknown as Vector3Tuple;
      const radialScale = 0.78 + random * 0.62;
      const speedScale = 0.72 + random * 0.58;
      return {
        mass,
        angle,
        offset: direction.map(
          (component) => component * separation * radialScale,
        ) as unknown as Vector3Tuple,
        ejection: direction.map(
          (component) => component * ejectionSpeed * speedScale,
        ) as unknown as Vector3Tuple,
      };
    });
    const meanOffset = [0, 0, 0];
    const meanEjection = [0, 0, 0];

    for (const fragment of fragments) {
      for (let component = 0; component < COMPONENTS_PER_BODY; component += 1) {
        meanOffset[component] =
          meanOffset[component]! + fragment.offset[component]! * fragment.mass / totalMass;
        meanEjection[component] =
          meanEjection[component]! + fragment.ejection[component]! * fragment.mass / totalMass;
      }
    }

    const remnants: BodyDefinition[] = [
      {
        id: `remnant-${eventSequence}`,
        name: 'Largest remnant',
        kind: this.kindsData[dominantIndex]!,
        surface: 'procedural',
        mass: largestMass,
        radius: combinedRadius * Math.cbrt(largestFraction),
        renderRadius: combinedRenderRadius * Math.cbrt(largestFraction),
        color: this.colorsData[dominantIndex]!,
        axialTilt: this.axialTiltData[dominantIndex]!,
        rotationRate: this.rotationRateData[dominantIndex]!,
        position: [
          centerPosition[0]! - meanOffset[0]!,
          centerPosition[1]! - meanOffset[1]!,
          centerPosition[2]! - meanOffset[2]!,
        ],
        velocity: [
          centerVelocity[0]! - meanEjection[0]!,
          centerVelocity[1]! - meanEjection[1]!,
          centerVelocity[2]! - meanEjection[2]!,
        ],
      },
    ];

    fragments.forEach((fragment, fragmentIndex) => {
      const fragmentFraction = fragment.mass / totalMass;
      remnants.push({
        id: `fragment-${eventSequence}-${fragmentIndex + 1}`,
        name: `Fragment ${fragmentIndex + 1}`,
        kind: 'rocky',
        surface: 'procedural',
        mass: fragment.mass,
        radius: combinedRadius * Math.cbrt(fragmentFraction),
        renderRadius: combinedRenderRadius * Math.cbrt(fragmentFraction) * 0.82,
        color: this.colorsData[fragmentIndex % 2 === 0 ? firstIndex : secondIndex]!,
        axialTilt: fragment.angle,
        rotationRate: (fragmentIndex % 2 === 0 ? 1 : -1) * (2.4 + fragmentIndex * 0.31),
        position: [
          centerPosition[0]! + fragment.offset[0] - meanOffset[0]!,
          centerPosition[1]! + fragment.offset[1] - meanOffset[1]!,
          centerPosition[2]! + fragment.offset[2] - meanOffset[2]!,
        ],
        velocity: [
          centerVelocity[0]! + fragment.ejection[0] - meanEjection[0]!,
          centerVelocity[1]! + fragment.ejection[1] - meanEjection[1]!,
          centerVelocity[2]! + fragment.ejection[2] - meanEjection[2]!,
        ],
      });
    });

    const bodies = this.createBodyDefinitions().filter(
      (_, bodyIndex) => bodyIndex !== firstIndex && bodyIndex !== secondIndex,
    );
    this.replaceBodies([...bodies, ...remnants]);
    return remnants.length;
  }

  private recordCollision(
    participants: readonly [string, string],
    analysis: CollisionAnalysis,
    fragmentCount: number,
  ): void {
    this.collisionSequence += 1;
    this.lastCollisionEventData = {
      sequence: this.collisionSequence,
      time: this.elapsedTime,
      outcome: analysis.outcome,
      participants,
      impactSpeed: analysis.impactSpeed,
      mutualEscapeSpeed: analysis.mutualEscapeSpeed,
      specificImpactEnergy: analysis.specificImpactEnergy,
      disruptionThreshold: analysis.disruptionThreshold,
      fragmentCount,
      radiatedMass: analysis.radiatedMass,
    };
  }

  private createBodyDefinitions(): BodyDefinition[] {
    const bodies: BodyDefinition[] = [];

    for (let bodyIndex = 0; bodyIndex < this.count; bodyIndex += 1) {
      const offset = bodyIndex * COMPONENTS_PER_BODY;
      bodies.push({
        id: this.idsData[bodyIndex]!,
        name: this.namesData[bodyIndex]!,
        kind: this.kindsData[bodyIndex]!,
        surface: this.surfacesData[bodyIndex]!,
        mass: this.massData[bodyIndex]!,
        radius: this.radiusData[bodyIndex]!,
        renderRadius: this.renderRadiusData[bodyIndex]!,
        color: this.colorsData[bodyIndex]!,
        axialTilt: this.axialTiltData[bodyIndex]!,
        rotationRate: this.rotationRateData[bodyIndex]!,
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

  private getMergedBlackHoleRadius(
    firstIndex: number,
    secondIndex: number,
    finalMass: number,
  ): number {
    const firstIsBlackHole = this.kindsData[firstIndex] === 'black-hole';
    const secondIsBlackHole = this.kindsData[secondIndex] === 'black-hole';

    if (firstIsBlackHole && secondIsBlackHole) {
      const combinedMass = this.massData[firstIndex]! + this.massData[secondIndex]!;
      return (
        (this.radiusData[firstIndex]! + this.radiusData[secondIndex]!) *
        (finalMass / combinedMass)
      );
    }

    const blackHoleIndex = firstIsBlackHole ? firstIndex : secondIndex;
    return (
      this.radiusData[blackHoleIndex]! * (finalMass / this.massData[blackHoleIndex]!)
    );
  }
}
