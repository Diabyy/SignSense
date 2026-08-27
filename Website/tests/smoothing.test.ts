import { describe, expect, it } from "vitest";

import type { GesturePrediction } from "../src/lib/mlp";
import { PredictionSmoother, TranscriptLatch } from "../src/lib/smoothing";

function prediction(label: string, confidence = 0.9): GesturePrediction {
  return {
    label,
    confidence,
    probabilities: new Float32Array(),
    featureHands: label === "UNKNOWN" ? 0 : 1,
  };
}

describe("prediction smoothing", () => {
  it("requires repeated predictions before exposing a stable label", () => {
    const smoother = new PredictionSmoother(500, 5, 0.6);
    for (let index = 0; index < 4; index += 1) {
      expect(smoother.update(prediction("A"), index * 50).label).toBe("UNKNOWN");
    }
    const stable = smoother.update(prediction("A", 0.95), 200);
    expect(stable.label).toBe("A");
    expect(stable.confidence).toBeCloseTo(0.91);
  });

  it("commits once until an UNKNOWN release interval passes", () => {
    const latch = new TranscriptLatch(300);
    const stableA = { label: "A", confidence: 0.9 };
    const unknown = { label: "UNKNOWN", confidence: 0 };

    expect(latch.update(stableA, 0)).toBe("A");
    expect(latch.update(stableA, 100)).toBeNull();
    expect(latch.update(unknown, 150)).toBeNull();
    expect(latch.update(unknown, 450)).toBeNull();
    expect(latch.update(stableA, 500)).toBe("A");
  });
});
