import { describe, expect, it } from "vitest";

import {
  advancePracticeProgress,
  progressFromPracticeSamples,
  PRACTICE_HOLD_DURATION_MS,
} from "../src/lib/practice";

describe("practice progress", () => {
  it("uses elapsed time instead of the number of updates", () => {
    const elapsedMs = PRACTICE_HOLD_DURATION_MS / 5;
    const oneUpdate = advancePracticeProgress(0, elapsedMs, true);
    const twoUpdates = advancePracticeProgress(
      advancePracticeProgress(0, elapsedMs / 2, true),
      elapsedMs / 2,
      true,
    );

    expect(oneUpdate).toBeCloseTo(20);
    expect(twoUpdates).toBeCloseTo(oneUpdate);
  });

  it("clamps progress at completion", () => {
    expect(advancePracticeProgress(90, PRACTICE_HOLD_DURATION_MS, true)).toBe(100);
  });

  it("decays an interrupted hold using elapsed time", () => {
    const progressed = advancePracticeProgress(0, PRACTICE_HOLD_DURATION_MS / 2, true);
    const interrupted = advancePracticeProgress(progressed, 250, false);

    expect(interrupted).toBeLessThan(progressed);
    expect(interrupted).toBeGreaterThanOrEqual(0);
  });

  it("does not complete after a single stalled update", () => {
    expect(advancePracticeProgress(0, PRACTICE_HOLD_DURATION_MS * 2, true)).toBeLessThan(100);
  });

  it("ignores invalid or negative elapsed time", () => {
    expect(advancePracticeProgress(25, -10, true)).toBe(25);
    expect(advancePracticeProgress(25, Number.NaN, true)).toBe(25);
  });

  it("continues progressing across unchanged matching snapshots", () => {
    const first = { processedAt: 100, isMatching: true };
    const second = { processedAt: 280, isMatching: true };

    expect(progressFromPracticeSamples(0, first, second)).toBeCloseTo(20);
  });

  it("attributes an interval to the previous observed state", () => {
    const previous = { processedAt: 100, isMatching: false };
    const current = { processedAt: 280, isMatching: true };

    expect(progressFromPracticeSamples(40, previous, current)).toBe(0);
  });

  it("does not inherit elapsed time after timing is reset", () => {
    const current = { processedAt: 500, isMatching: true };

    expect(progressFromPracticeSamples(0, null, current)).toBe(0);
  });
});
