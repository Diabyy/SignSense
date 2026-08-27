import { describe, expect, it } from "vitest";

import {
  FEATURE_COUNT,
  buildFeatureHypotheses,
  buildOneHandFeature,
  buildTwoHandFeature,
  toPixelHands,
  type Point3,
} from "../src/lib/features";

function sampleHand(offsetX = 0, offsetY = 0, scale = 1): Point3[] {
  const hand = Array.from({ length: 21 }, (_, index) => ({
    x: offsetX + scale * (index % 5) * 0.1,
    y: offsetY + scale * Math.floor(index / 5) * 0.12,
    z: scale * index * 0.01,
  }));
  hand[9] = { x: offsetX + scale, y: offsetY, z: 0 };
  return hand;
}

describe("landmark feature builder", () => {
  it("builds a translation and scale invariant one-hand pose", () => {
    const first = buildOneHandFeature([sampleHand()]);
    const transformed = buildOneHandFeature([sampleHand(40, -20, 3.5)]);

    expect(first).toHaveLength(FEATURE_COUNT);
    expect(Array.from(first.slice(0, 63))).toEqual(Array.from(transformed.slice(0, 63)));
    expect(Array.from(first.slice(126, 128))).toEqual([1, 0]);
  });

  it("orders two hands from the leftmost wrist and preserves relative geometry", () => {
    const rightmost = sampleHand(80, 5, 2);
    const leftmost = sampleHand(20, 10, 2);
    const features = buildTwoHandFeature([rightmost, leftmost]);

    expect(Array.from(features.slice(126, 128))).toEqual([1, 1]);
    expect(features[128]).toBeGreaterThan(0);
    expect(features[129]).toBeLessThan(0);
    expect(features[130]).toBeCloseTo(Math.hypot(features[128]!, features[129]!), 6);
  });

  it("converts normalized coordinates to aspect-correct pixel coordinates", () => {
    const hand = sampleHand().map((point) => ({
      x: point.x / 100,
      y: point.y / 50,
      z: point.z / 100,
    }));
    const pixelHand = toPixelHands([hand], 100, 50)[0]!;

    expect(pixelHand[8]!.x).toBeCloseTo(sampleHand()[8]!.x);
    expect(pixelHand[8]!.y).toBeCloseTo(sampleHand()[8]!.y);
    expect(pixelHand[8]!.z).toBeCloseTo(sampleHand()[8]!.z);
  });

  it("creates one- and two-hand hypotheses when both hands are visible", () => {
    const hands = [sampleHand(0.1), sampleHand(0.55)].map((hand) =>
      hand.map((point) => ({ x: point.x / 2, y: point.y / 2, z: point.z / 2 })),
    );
    const hypotheses = buildFeatureHypotheses(hands, 640, 480);

    expect(hypotheses.map((hypothesis) => hypothesis.featureHands)).toEqual([1, 2]);
  });
});
