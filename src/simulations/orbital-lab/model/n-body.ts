import type {
  BodyDefinition,
  BodyKind,
  BodySurface,
  CollisionEvent,
  SimulationDiagnostics,
  SimulationOptions,
  Vector3Tuple,
} from './types';
import {
  analyzeCollision,
  classifyCollisionVisual,
  type CollisionAnalysis,
} from './collision-model';
import {
  CollisionBroadphase,
  type CollisionBroadphaseAlgorithm,
} from './collision-broadphase';
import { AdaptiveGravitySolver, type GravityAlgorithm } from './gravity-solver';

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

  private readonly gravitySolver: AdaptiveGravitySolver;
  private readonly collisionBroadphase = new CollisionBroadphase();
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
    const directThreshold =
      options.gravitySolver === 'direct'
        ? Number.MAX_SAFE_INTEGER
        : options.gravitySolver === 'barnes-hut'
          ? 0
          : options.gravityDirectThreshold;
    this.gravitySolver = new AdaptiveGravitySolver({
      directThreshold,
      openingAngle: options.gravityOpeningAngle,
    });

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

  get gravityAlgorithm(): GravityAlgorithm {
    return this.gravitySolver.algorithm;
  }

  get collisionAlgorithm(): CollisionBroadphaseAlgorithm {
    return this.collisionBroadphase.algorithm;
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
    this.gravitySolver.compute(
      this.positionData,
      this.massData,
      this.gravitationalConstant,
      this.softening,
      target,
    );
  }

  private resolveCollisions(): void {
    const pair = this.collisionBroadphase.findFirst(this.positionData, this.radiusData);
    if (pair === undefined) {
      return;
    }

    const [bodyIndex, otherIndex] = pair;
    const offset = bodyIndex * COMPONENTS_PER_BODY;
    const otherOffset = otherIndex * COMPONENTS_PER_BODY;
    const relativePosition: Vector3Tuple = [
      this.positionData[otherOffset]! - this.positionData[offset]!,
      this.positionData[otherOffset + 1]! - this.positionData[offset + 1]!,
      this.positionData[otherOffset + 2]! - this.positionData[offset + 2]!,
    ];
    const relativeVelocity: Vector3Tuple = [
      this.velocityData[otherOffset]! - this.velocityData[offset]!,
      this.velocityData[otherOffset + 1]! - this.velocityData[offset + 1]!,
      this.velocityData[otherOffset + 2]! - this.velocityData[offset + 2]!,
    ];
    const analysis = analyzeCollision({
      firstMass: this.massData[bodyIndex]!,
      secondMass: this.massData[otherIndex]!,
      firstRadius: this.radiusData[bodyIndex]!,
      secondRadius: this.radiusData[otherIndex]!,
      firstKind: this.kindsData[bodyIndex]!,
      secondKind: this.kindsData[otherIndex]!,
      relativePosition,
      relativeVelocity,
      gravitationalConstant: this.gravitationalConstant,
    });
    const participants: readonly [string, string] = [
      this.idsData[bodyIndex]!,
      this.idsData[otherIndex]!,
    ];
    const firstMass = this.massData[bodyIndex]!;
    const secondMass = this.massData[otherIndex]!;
    const combinedMass = firstMass + secondMass;
    const contactPosition: Vector3Tuple = [
      (this.positionData[offset]! * firstMass +
        this.positionData[otherOffset]! * secondMass) /
        combinedMass,
      (this.positionData[offset + 1]! * firstMass +
        this.positionData[otherOffset + 1]! * secondMass) /
        combinedMass,
      (this.positionData[offset + 2]! * firstMass +
        this.positionData[otherOffset + 2]! * secondMass) /
        combinedMass,
    ];
    const separation = Math.hypot(...relativePosition);
    const contactNormal: Vector3Tuple =
      separation > Number.EPSILON
        ? [
            relativePosition[0] / separation,
            relativePosition[1] / separation,
            relativePosition[2] / separation,
          ]
        : [1, 0, 0];
    const visualRadius = Math.max(
      this.renderRadiusData[bodyIndex]!,
      this.renderRadiusData[otherIndex]!,
    );
    const visualClass = classifyCollisionVisual(
      this.kindsData[bodyIndex]!,
      this.kindsData[otherIndex]!,
    );
    const participantKinds: readonly [BodyKind, BodyKind] = [
      this.kindsData[bodyIndex]!,
      this.kindsData[otherIndex]!,
    ];
    const participantColors: readonly [string, string] = [
      this.colorsData[bodyIndex]!,
      this.colorsData[otherIndex]!,
    ];
    const participantVisualRadii: readonly [number, number] = [
      this.renderRadiusData[bodyIndex]!,
      this.renderRadiusData[otherIndex]!,
    ];

    if (analysis.outcome === 'hit-and-run') {
      this.resolveHitAndRun(bodyIndex, otherIndex, relativePosition);
      this.recordCollision(
        participants,
        analysis,
        contactPosition,
        contactNormal,
        relativeVelocity,
        visualRadius,
        visualClass,
        participantKinds,
        participantColors,
        participantVisualRadii,
        0,
      );
    } else if (analysis.outcome === 'disruption') {
      // A credible disruptive impact requires a hydrodynamic/SPH solver. Keep
      // the two resolved masses and separate them instead of inventing a
      // handful of spherical fragments that would be mistaken for physics.
      this.resolveHitAndRun(bodyIndex, otherIndex, relativePosition);
      this.recordCollision(
        participants,
        analysis,
        contactPosition,
        contactNormal,
        relativeVelocity,
        visualRadius,
        visualClass,
        participantKinds,
        participantColors,
        participantVisualRadii,
        0,
      );
    } else {
      this.recordCollision(
        participants,
        analysis,
        contactPosition,
        contactNormal,
        relativeVelocity,
        visualRadius,
        visualClass,
        participantKinds,
        participantColors,
        participantVisualRadii,
        1,
      );
      this.mergePair(bodyIndex, otherIndex, analysis);
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
    const visualClass = classifyCollisionVisual(
      this.kindsData[firstIndex]!,
      this.kindsData[secondIndex]!,
    );
    const mergedKind =
      this.kindsData[firstIndex] === 'black-hole' ||
      this.kindsData[secondIndex] === 'black-hole'
        ? 'black-hole'
        : this.kindsData[dominantIndex]!;
    const volumeEquivalentRenderRadius = Math.cbrt(
      this.renderRadiusData[firstIndex]! ** 3 + this.renderRadiusData[secondIndex]! ** 3,
    );
    const mergedName =
      mergedKind === 'black-hole'
        ? `${this.namesData[firstIndex]} + ${this.namesData[secondIndex]}`
        : visualClass === 'stellar-merger'
          ? 'Stellar merger remnant'
          : visualClass === 'compact-merger'
            ? 'Compact merger remnant'
            : 'Post-impact remnant';
    const blackHoleSurfaces = [firstIndex, secondIndex]
      .filter((index) => this.kindsData[index] === 'black-hole')
      .map((index) => this.surfacesData[index]!);
    const retainedBlackHoleSurface: BodySurface = blackHoleSurfaces.includes('quasar')
      ? 'quasar'
      : blackHoleSurfaces.includes('accretion-disk')
        ? 'accretion-disk'
        : 'none';
    const mergedSurface: BodySurface =
      mergedKind === 'black-hole'
        ? retainedBlackHoleSurface
        : visualClass === 'stellar-merger'
          ? 'stellar-merger'
          : visualClass === 'compact-merger'
            ? this.surfacesData[dominantIndex]!
            : 'impact-remnant';

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
      name: mergedName,
      kind: mergedKind,
      surface: mergedSurface,
      mass: finalMass,
      radius:
        mergedKind === 'black-hole'
          ? this.getMergedBlackHoleRadius(firstIndex, secondIndex, finalMass)
          : Math.cbrt(
              this.radiusData[firstIndex]! ** 3 + this.radiusData[secondIndex]! ** 3,
            ),
      renderRadius:
        visualClass === 'stellar-merger'
          ? volumeEquivalentRenderRadius * 1.32
          : volumeEquivalentRenderRadius,
      color:
        mergedSurface === 'impact-remnant'
          ? '#ff7a32'
          : mergedSurface === 'stellar-merger'
            ? '#ffad6a'
          : this.colorsData[dominantIndex]!,
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

  private recordCollision(
    participants: readonly [string, string],
    analysis: CollisionAnalysis,
    position: Vector3Tuple,
    normal: Vector3Tuple,
    relativeVelocity: Vector3Tuple,
    visualRadius: number,
    visualClass: CollisionEvent['visualClass'],
    participantKinds: CollisionEvent['participantKinds'],
    participantColors: CollisionEvent['participantColors'],
    participantVisualRadii: CollisionEvent['participantVisualRadii'],
    fragmentCount: number,
  ): void {
    this.collisionSequence += 1;
    this.lastCollisionEventData = {
      sequence: this.collisionSequence,
      time: this.elapsedTime,
      outcome: analysis.outcome,
      visualClass,
      participants,
      participantKinds,
      participantColors,
      participantVisualRadii,
      impactSpeed: analysis.impactSpeed,
      mutualEscapeSpeed: analysis.mutualEscapeSpeed,
      specificImpactEnergy: analysis.specificImpactEnergy,
      disruptionThreshold: analysis.disruptionThreshold,
      position,
      normal,
      relativeVelocity,
      visualRadius,
      // The empirical giant-impact ensemble gives a characteristic escaping
      // debris speed near half the impact speed. This is metadata for the
      // unresolved tracer cloud, not a replacement for fragment dynamics.
      ejectaSpeed: analysis.impactSpeed * 0.5,
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
