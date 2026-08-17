import type {
  BodyKind,
  CollisionOutcome,
  CollisionVisualClass,
  Vector3Tuple,
} from './types';

export interface CollisionInputs {
  readonly firstMass: number;
  readonly secondMass: number;
  readonly firstRadius: number;
  readonly secondRadius: number;
  readonly firstKind: BodyKind;
  readonly secondKind: BodyKind;
  readonly relativePosition: Vector3Tuple;
  readonly relativeVelocity: Vector3Tuple;
  readonly gravitationalConstant: number;
}

export interface CollisionAnalysis {
  readonly outcome: CollisionOutcome;
  readonly impactSpeed: number;
  readonly mutualEscapeSpeed: number;
  readonly impactParameter: number;
  readonly specificImpactEnergy: number;
  readonly disruptionThreshold: number;
  readonly energyRatio: number;
  readonly radiatedMass: number;
}

const vectorLength = (vector: Vector3Tuple): number => Math.hypot(...vector);

export const classifyCollisionVisual = (
  firstKind: BodyKind,
  secondKind: BodyKind,
): CollisionVisualClass => {
  const bothBlackHoles = firstKind === 'black-hole' && secondKind === 'black-hole';
  if (bothBlackHoles) return 'compact-merger';

  const includesBlackHole = firstKind === 'black-hole' || secondKind === 'black-hole';
  const includesOrdinaryStar = firstKind === 'star' || secondKind === 'star';
  if (includesBlackHole) {
    return includesOrdinaryStar ? 'tidal-disruption' : 'horizon-capture';
  }

  if (includesOrdinaryStar) return 'stellar-merger';
  const compactKinds: readonly BodyKind[] = ['neutron-star', 'pulsar'];
  if (compactKinds.includes(firstKind) && compactKinds.includes(secondKind)) {
    return 'compact-merger';
  }
  return 'planetary-impact';
};

export const analyzeCollision = (inputs: CollisionInputs): CollisionAnalysis => {
  const totalMass = inputs.firstMass + inputs.secondMass;
  const reducedMass = (inputs.firstMass * inputs.secondMass) / totalMass;
  const combinedRadius = inputs.firstRadius + inputs.secondRadius;
  const impactSpeed = vectorLength(inputs.relativeVelocity);
  const separation = Math.max(vectorLength(inputs.relativePosition), Number.EPSILON);
  const crossX =
    inputs.relativePosition[1] * inputs.relativeVelocity[2] -
    inputs.relativePosition[2] * inputs.relativeVelocity[1];
  const crossY =
    inputs.relativePosition[2] * inputs.relativeVelocity[0] -
    inputs.relativePosition[0] * inputs.relativeVelocity[2];
  const crossZ =
    inputs.relativePosition[0] * inputs.relativeVelocity[1] -
    inputs.relativePosition[1] * inputs.relativeVelocity[0];
  const impactParameter =
    impactSpeed <= Number.EPSILON
      ? 0
      : Math.min(1, Math.hypot(crossX, crossY, crossZ) / (separation * impactSpeed));
  const mutualEscapeSpeed =
    combinedRadius <= 0
      ? 0
      : Math.sqrt(
          (2 * inputs.gravitationalConstant * totalMass) / Math.max(combinedRadius, Number.EPSILON),
        );
  const specificImpactEnergy = (0.5 * reducedMass * impactSpeed ** 2) / totalMass;
  const combinedVolumeRadius = Math.cbrt(
    inputs.firstRadius ** 3 + inputs.secondRadius ** 3,
  );
  // Fluid-planet gravity-regime approximation: c* = 1.9 times binding energy per mass.
  const disruptionThreshold =
    combinedVolumeRadius <= 0
      ? Number.POSITIVE_INFINITY
      : 1.9 *
        0.6 *
        inputs.gravitationalConstant *
        totalMass /
        combinedVolumeRadius;
  const energyRatio = specificImpactEnergy / disruptionThreshold;
  const bothBlackHoles =
    inputs.firstKind === 'black-hole' && inputs.secondKind === 'black-hole';
  const includesBlackHole =
    inputs.firstKind === 'black-hole' || inputs.secondKind === 'black-hole';
  const symmetricMassRatio = (inputs.firstMass * inputs.secondMass) / totalMass ** 2;
  const radiatedMass = bothBlackHoles ? totalMass * 0.05 * 4 * symmetricMassRatio : 0;
  let outcome: CollisionOutcome = 'merge';

  if (bothBlackHoles) {
    outcome = 'black-hole-merger';
  } else if (includesBlackHole) {
    outcome = 'capture';
  } else if (inputs.gravitationalConstant > 0 && energyRatio >= 1) {
    outcome = 'disruption';
  } else {
    const targetRadius =
      inputs.firstMass >= inputs.secondMass ? inputs.firstRadius : inputs.secondRadius;
    const grazingThreshold = targetRadius / Math.max(combinedRadius, Number.EPSILON);
    if (impactParameter > grazingThreshold && impactSpeed > mutualEscapeSpeed * 1.05) {
      outcome = 'hit-and-run';
    }
  }

  return {
    outcome,
    impactSpeed,
    mutualEscapeSpeed,
    impactParameter,
    specificImpactEnergy,
    disruptionThreshold,
    energyRatio,
    radiatedMass,
  };
};
