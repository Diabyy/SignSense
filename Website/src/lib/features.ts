export const FEATURE_VERSION = "hand-pose-v2";
export const FEATURE_COUNT = 132;
export const LANDMARK_COUNT = 21;

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface FeatureHypothesis {
  features: Float32Array;
  featureHands: 1 | 2;
}

interface NormalizedHand {
  pose: Float32Array;
  wrist: Point3;
  scale: number;
}

function assertHand(hand: readonly Point3[]): void {
  if (hand.length !== LANDMARK_COUNT) {
    throw new Error(`Expected ${LANDMARK_COUNT} landmarks, received ${hand.length}.`);
  }
  for (const point of hand) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) {
      throw new Error("Hand landmarks contain a non-finite coordinate.");
    }
  }
}

function handScale(hand: readonly Point3[]): number {
  assertHand(hand);
  const wrist = hand[0]!;
  const middleMcp = hand[9]!;
  return Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
}

function normalizeHand(hand: readonly Point3[]): NormalizedHand {
  const scale = handScale(hand);
  if (scale < 1e-6) {
    throw new Error("Hand scale is zero or too small.");
  }

  const wrist = hand[0]!;
  const pose = new Float32Array(LANDMARK_COUNT * 3);
  for (let index = 0; index < LANDMARK_COUNT; index += 1) {
    const point = hand[index]!;
    const offset = index * 3;
    pose[offset] = (point.x - wrist.x) / scale;
    pose[offset + 1] = (point.y - wrist.y) / scale;
    pose[offset + 2] = (point.z - wrist.z) / scale;
  }
  return { pose, wrist: { ...wrist }, scale };
}

export function toPixelHands(
  hands: readonly (readonly Point3[])[],
  frameWidth: number,
  frameHeight: number,
): Point3[][] {
  if (frameWidth <= 0 || frameHeight <= 0) {
    throw new Error("Video dimensions are not ready.");
  }
  return hands.map((hand) => {
    assertHand(hand);
    return hand.map((point) => ({
      x: point.x * frameWidth,
      y: point.y * frameHeight,
      z: point.z * frameWidth,
    }));
  });
}

export function buildOneHandFeature(hands: readonly (readonly Point3[])[]): Float32Array {
  if (hands.length === 0) {
    throw new Error("At least one hand is required.");
  }
  const selected = hands.reduce((largest, hand) =>
    handScale(hand) > handScale(largest) ? hand : largest,
  );
  const normalized = normalizeHand(selected);
  const features = new Float32Array(FEATURE_COUNT);
  features.set(normalized.pose, 0);
  features[126] = 1;
  return features;
}

export function buildTwoHandFeature(hands: readonly (readonly Point3[])[]): Float32Array {
  if (hands.length < 2) {
    throw new Error("Two hands are required for a two-hand feature.");
  }
  const ordered = [...hands]
    .sort((first, second) => first[0]!.x - second[0]!.x)
    .slice(0, 2);
  const first = normalizeHand(ordered[0]!);
  const second = normalizeHand(ordered[1]!);
  const features = new Float32Array(FEATURE_COUNT);
  features.set(first.pose, 0);
  features.set(second.pose, 63);
  features[126] = 1;
  features[127] = 1;

  const meanScale = (first.scale + second.scale) / 2;
  const deltaX = (second.wrist.x - first.wrist.x) / meanScale;
  const deltaY = (second.wrist.y - first.wrist.y) / meanScale;
  features[128] = deltaX;
  features[129] = deltaY;
  features[130] = Math.hypot(deltaX, deltaY);
  features[131] = Math.log(second.scale / first.scale);
  return features;
}

export function buildFeatureHypotheses(
  normalizedHands: readonly (readonly Point3[])[],
  frameWidth: number,
  frameHeight: number,
): FeatureHypothesis[] {
  if (normalizedHands.length === 0) {
    return [];
  }
  const pixelHands = toPixelHands(normalizedHands, frameWidth, frameHeight);
  const hypotheses: FeatureHypothesis[] = [
    { features: buildOneHandFeature(pixelHands), featureHands: 1 },
  ];
  if (pixelHands.length >= 2) {
    hypotheses.push({ features: buildTwoHandFeature(pixelHands), featureHands: 2 });
  }
  return hypotheses;
}
