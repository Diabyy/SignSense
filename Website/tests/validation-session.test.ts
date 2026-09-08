import { describe, expect, it } from "vitest";

import {
  createValidationSession,
  validationAttemptDuration,
  recordValidationAttempt,
  serializeValidationSession,
  summarizeValidationSession,
  validationSessionFilename,
} from "../src/lib/validation-session";

const completedAttempt = {
  targetLetter: "A",
  predictedLabel: "A",
  confidence: 0.82,
  detectedHands: 2,
  fps: 24.5,
  inferenceMs: 18.4,
  durationMs: 1_240,
  outcome: "completed" as const,
  recordedAt: "2026-09-08T05:00:01.240Z",
};

describe("validation session", () => {
  it("excludes paused time between active camera segments", () => {
    const firstSegmentMs = validationAttemptDuration(0, 100, 340);
    const completedMs = validationAttemptDuration(firstSegmentMs, 1_000, 1_180);

    expect(firstSegmentMs).toBe(240);
    expect(completedMs).toBe(420);
    expect(validationAttemptDuration(firstSegmentMs, null, 9_000)).toBe(240);
  });

  it("creates a pseudonymous empty session", () => {
    const session = createValidationSession({
      id: "session-001",
      mode: "bisindo",
      startedAt: "2026-09-08T05:00:00.000Z",
    });

    expect(session).toEqual({
      schemaVersion: 1,
      id: "session-001",
      mode: "bisindo",
      startedAt: "2026-09-08T05:00:00.000Z",
      attempts: [],
    });
    expect(session).not.toHaveProperty("name");
    expect(session).not.toHaveProperty("email");
  });

  it("records attempts immutably in sequence", () => {
    const session = createValidationSession({
      id: "session-001",
      mode: "bisindo",
      startedAt: "2026-09-08T05:00:00.000Z",
    });
    const updated = recordValidationAttempt(session, completedAttempt);

    expect(session.attempts).toHaveLength(0);
    expect(updated.attempts).toEqual([{ sequence: 1, ...completedAttempt }]);
  });

  it("normalizes invalid numeric metrics before export", () => {
    const session = createValidationSession({
      id: "session-001",
      mode: "bisindo",
      startedAt: "2026-09-08T05:00:00.000Z",
    });
    const updated = recordValidationAttempt(session, {
      ...completedAttempt,
      confidence: Number.NaN,
      detectedHands: -2,
      fps: Number.POSITIVE_INFINITY,
      inferenceMs: -8,
      durationMs: Number.NaN,
    });

    expect(updated.attempts[0]).toMatchObject({
      confidence: 0,
      detectedHands: 0,
      fps: 0,
      inferenceMs: 0,
      durationMs: 0,
    });
  });

  it("summarizes completed and skipped attempts", () => {
    const initial = createValidationSession({
      id: "session-001",
      mode: "bisindo",
      startedAt: "2026-09-08T05:00:00.000Z",
    });
    const completed = recordValidationAttempt(initial, completedAttempt);
    const session = recordValidationAttempt(completed, {
      ...completedAttempt,
      targetLetter: "B",
      predictedLabel: "UNKNOWN",
      durationMs: 2_000,
      outcome: "skipped",
    });

    expect(summarizeValidationSession(session)).toEqual({
      totalAttempts: 2,
      completedAttempts: 1,
      skippedAttempts: 1,
      completionRate: 0.5,
      meanCompletionMs: 1_240,
    });
  });

  it("serializes a portable report with its summary", () => {
    const session = recordValidationAttempt(
      createValidationSession({
        id: "session-001",
        mode: "bisindo",
        startedAt: "2026-09-08T05:00:00.000Z",
      }),
      completedAttempt,
    );
    const report = JSON.parse(serializeValidationSession(session));

    expect(report.session).toEqual(session);
    expect(report.summary.completedAttempts).toBe(1);
    expect(report.privacy).toContain("tidak memuat frame");
  });

  it("builds a filesystem-safe export filename", () => {
    const session = createValidationSession({
      id: "session:001/test",
      mode: "asl",
      startedAt: "2026-09-08T05:00:00.000Z",
    });

    expect(validationSessionFilename(session)).toBe(
      "signsense-validation-asl-session-001-test.json",
    );
  });
});
