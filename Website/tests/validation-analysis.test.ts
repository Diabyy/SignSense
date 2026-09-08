import { describe, expect, it } from "vitest";

import {
  analyzeValidationSessions,
  isCurrentValidationImport,
  parseValidationReport,
} from "../src/lib/validation-analysis";
import type { ValidationSession } from "../src/lib/validation-session";

const validReport = {
  session: {
    schemaVersion: 1,
    id: "signer-a",
    mode: "bisindo",
    startedAt: "2026-09-08T05:00:00.000Z",
    attempts: [
      {
        sequence: 1,
        targetLetter: "A",
        predictedLabel: "A",
        confidence: 0.9,
        detectedHands: 2,
        fps: 25,
        inferenceMs: 18,
        durationMs: 1_200,
        outcome: "completed",
        recordedAt: "2026-09-08T05:00:01.200Z",
      },
    ],
  } satisfies ValidationSession,
  summary: {
    totalAttempts: 1,
    completedAttempts: 1,
    skippedAttempts: 0,
    completionRate: 1,
    meanCompletionMs: 1_200,
  },
  privacy: "tidak memuat frame",
};

describe("validation analysis", () => {
  it("parses a valid schema-v1 report", () => {
    expect(parseValidationReport(JSON.stringify(validReport))).toEqual(
      validReport.session,
    );
  });

  it("rejects malformed or unsupported reports", () => {
    expect(() => parseValidationReport("not-json")).toThrow("JSON tidak valid");
    expect(() =>
      parseValidationReport(JSON.stringify({ session: { schemaVersion: 2 } })),
    ).toThrow("format laporan SignSense v1");
  });

  it("rejects impossible metrics and broken attempt sequences", () => {
    const invalidMetrics = {
      ...validReport,
      session: {
        ...validReport.session,
        attempts: [
          { ...validReport.session.attempts[0]!, confidence: 1.2, fps: -1 },
        ],
      },
    };
    const brokenSequence = {
      ...validReport,
      session: {
        ...validReport.session,
        attempts: [{ ...validReport.session.attempts[0]!, sequence: 2 }],
      },
    };

    expect(() => parseValidationReport(JSON.stringify(invalidMetrics))).toThrow(
      "format laporan SignSense v1",
    );
    expect(() => parseValidationReport(JSON.stringify(brokenSequence))).toThrow(
      "urutan attempt",
    );
  });

  it("aggregates multi-signer quality metrics and confusion counts", () => {
    const first = validReport.session;
    const baseAttempt = validReport.session.attempts[0]!;
    const second: ValidationSession = {
      ...validReport.session,
      id: "signer-b",
      attempts: [
        {
          ...baseAttempt,
          sequence: 1,
          targetLetter: "A",
          predictedLabel: "B",
          confidence: 0.6,
          fps: 20,
          inferenceMs: 25,
          durationMs: 2_000,
          outcome: "skipped",
        },
        {
          ...baseAttempt,
          sequence: 2,
          targetLetter: "B",
          predictedLabel: "UNKNOWN",
          confidence: 0,
          detectedHands: 0,
          fps: 15,
          inferenceMs: 30,
          durationMs: 1_500,
          outcome: "skipped",
        },
      ],
    };

    const analysis = analyzeValidationSessions([first, second]);

    expect(analysis).toMatchObject({
      mode: "bisindo",
      sessionCount: 2,
      totalAttempts: 3,
      completedAttempts: 1,
      completionRate: 1 / 3,
      unknownRate: 1 / 3,
      detectorMissRate: 1 / 3,
      meanFps: 20,
      meanInferenceMs: 73 / 3,
      meanCompletionMs: 1_200,
    });
    expect(analysis.perLetter).toEqual([
      {
        letter: "A",
        attempts: 2,
        completed: 1,
        completionRate: 0.5,
        meanCompletionMs: 1_200,
        predictions: { A: 1, B: 1 },
      },
      {
        letter: "B",
        attempts: 1,
        completed: 0,
        completionRate: 0,
        meanCompletionMs: null,
        predictions: { UNKNOWN: 1 },
      },
    ]);
  });

  it("rejects duplicate sessions", () => {
    expect(() =>
      analyzeValidationSessions([validReport.session, validReport.session]),
    ).toThrow("ID sesi duplikat");
  });

  it("rejects mixed sign modes", () => {
    expect(() =>
      analyzeValidationSessions([
        validReport.session,
        { ...validReport.session, id: "signer-asl", mode: "asl" },
      ]),
    ).toThrow("mode yang sama");
  });

  it("counts prediction labels that match object prototype names", () => {
    const session: ValidationSession = {
      ...validReport.session,
      attempts: [
        {
          ...validReport.session.attempts[0]!,
          predictedLabel: "__proto__",
        },
      ],
    };

    expect(analyzeValidationSessions([session]).perLetter[0]?.predictions).toEqual(
      Object.fromEntries([["__proto__", 1]]),
    );
  });

  it("accepts only the latest asynchronous import request", () => {
    expect(isCurrentValidationImport(2, 2)).toBe(true);
    expect(isCurrentValidationImport(1, 2)).toBe(false);
  });
});
