import type { SignMode } from "./modes";

export type ValidationOutcome = "completed" | "skipped";

export interface ValidationAttemptInput {
  targetLetter: string;
  predictedLabel: string;
  confidence: number;
  detectedHands: number;
  fps: number;
  inferenceMs: number;
  durationMs: number;
  outcome: ValidationOutcome;
  recordedAt: string;
}

export interface ValidationAttempt extends ValidationAttemptInput {
  sequence: number;
}

export interface ValidationSession {
  schemaVersion: 1;
  id: string;
  mode: SignMode;
  startedAt: string;
  attempts: ValidationAttempt[];
}

export interface ValidationSummary {
  totalAttempts: number;
  completedAttempts: number;
  skippedAttempts: number;
  completionRate: number;
  meanCompletionMs: number | null;
}

export function createValidationSession(input: {
  id: string;
  mode: SignMode;
  startedAt: string;
}): ValidationSession {
  return {
    schemaVersion: 1,
    id: input.id,
    mode: input.mode,
    startedAt: input.startedAt,
    attempts: [],
  };
}

function nonNegativeFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function validationAttemptDuration(
  accumulatedMs: number,
  activeSince: number | null,
  latestProcessedAt: number,
): number {
  const accumulated = nonNegativeFinite(accumulatedMs);
  if (activeSince === null) return accumulated;
  return accumulated + nonNegativeFinite(latestProcessedAt - activeSince);
}

export function recordValidationAttempt(
  session: ValidationSession,
  attempt: ValidationAttemptInput,
): ValidationSession {
  return {
    ...session,
    attempts: [
      ...session.attempts,
      {
        sequence: session.attempts.length + 1,
        ...attempt,
        confidence: Math.min(1, nonNegativeFinite(attempt.confidence)),
        detectedHands: Math.floor(nonNegativeFinite(attempt.detectedHands)),
        fps: nonNegativeFinite(attempt.fps),
        inferenceMs: nonNegativeFinite(attempt.inferenceMs),
        durationMs: nonNegativeFinite(attempt.durationMs),
      },
    ],
  };
}

export function summarizeValidationSession(
  session: ValidationSession,
): ValidationSummary {
  const completed = session.attempts.filter(
    (attempt) => attempt.outcome === "completed",
  );
  const totalAttempts = session.attempts.length;
  const completedAttempts = completed.length;
  const skippedAttempts = totalAttempts - completedAttempts;
  const totalCompletionMs = completed.reduce(
    (total, attempt) => total + attempt.durationMs,
    0,
  );

  return {
    totalAttempts,
    completedAttempts,
    skippedAttempts,
    completionRate: totalAttempts === 0 ? 0 : completedAttempts / totalAttempts,
    meanCompletionMs:
      completedAttempts === 0 ? null : totalCompletionMs / completedAttempts,
  };
}

export function serializeValidationSession(session: ValidationSession): string {
  return JSON.stringify(
    {
      session,
      summary: summarizeValidationSession(session),
      privacy:
        "Laporan pseudonim ini tidak memuat frame, gambar, video, nama, email, atau data biometrik mentah.",
    },
    null,
    2,
  );
}

export function validationSessionFilename(session: ValidationSession): string {
  const safeId = session.id
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "anonymous";
  return `signsense-validation-${session.mode}-${safeId}.json`;
}
