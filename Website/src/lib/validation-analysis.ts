import type {
  ValidationAttempt,
  ValidationSession,
} from "./validation-session";

export interface ValidationLetterAnalysis {
  letter: string;
  attempts: number;
  completed: number;
  completionRate: number;
  meanCompletionMs: number | null;
  predictions: Record<string, number>;
}

export interface ValidationAnalysis {
  mode: ValidationSession["mode"];
  sessionCount: number;
  totalAttempts: number;
  completedAttempts: number;
  completionRate: number;
  unknownRate: number;
  detectorMissRate: number;
  meanFps: number | null;
  meanInferenceMs: number | null;
  meanCompletionMs: number | null;
  perLetter: ValidationLetterAnalysis[];
}

export function isCurrentValidationImport(
  requestId: number,
  latestRequestId: number,
): boolean {
  return requestId === latestRequestId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidationAttempt(value: unknown): value is ValidationAttempt {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.sequence) &&
    (value.sequence as number) >= 1 &&
    typeof value.targetLetter === "string" &&
    value.targetLetter.length > 0 &&
    typeof value.predictedLabel === "string" &&
    value.predictedLabel.length > 0 &&
    isFiniteNumber(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    Number.isInteger(value.detectedHands) &&
    (value.detectedHands as number) >= 0 &&
    isFiniteNumber(value.fps) &&
    value.fps >= 0 &&
    isFiniteNumber(value.inferenceMs) &&
    value.inferenceMs >= 0 &&
    isFiniteNumber(value.durationMs) &&
    value.durationMs >= 0 &&
    (value.outcome === "completed" || value.outcome === "skipped") &&
    typeof value.recordedAt === "string"
  );
}

function isValidationSession(value: unknown): value is ValidationSession {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    (value.mode === "bisindo" || value.mode === "asl") &&
    typeof value.startedAt === "string" &&
    Array.isArray(value.attempts) &&
    value.attempts.every(isValidationAttempt)
  );
}

export function parseValidationReport(source: string): ValidationSession {
  let report: unknown;
  try {
    report = JSON.parse(source);
  } catch {
    throw new Error("JSON tidak valid.");
  }

  if (!isRecord(report) || !isValidationSession(report.session)) {
    throw new Error("File bukan format laporan SignSense v1 yang didukung.");
  }
  if (
    report.session.attempts.some(
      (attempt, index) => attempt.sequence !== index + 1,
    )
  ) {
    throw new Error("File memiliki urutan attempt yang tidak valid.");
  }
  return report.session;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function analyzeValidationSessions(
  sessions: ValidationSession[],
): ValidationAnalysis {
  if (sessions.length === 0) {
    throw new Error("Pilih setidaknya satu laporan validasi.");
  }
  const mode = sessions[0]?.mode;
  if (!mode) throw new Error("Mode laporan tidak tersedia.");
  if (sessions.some((session) => session.mode !== mode)) {
    throw new Error("Semua laporan harus menggunakan mode yang sama.");
  }
  const sessionIds = new Set<string>();
  for (const session of sessions) {
    if (sessionIds.has(session.id)) {
      throw new Error(`ID sesi duplikat: ${session.id}.`);
    }
    sessionIds.add(session.id);
  }

  const attempts = sessions.flatMap((session) => session.attempts);
  const completed = attempts.filter((attempt) => attempt.outcome === "completed");
  const totalAttempts = attempts.length;
  const perLetterGroups = new Map<string, ValidationAttempt[]>();
  for (const attempt of attempts) {
    const group = perLetterGroups.get(attempt.targetLetter) ?? [];
    group.push(attempt);
    perLetterGroups.set(attempt.targetLetter, group);
  }

  const perLetter = [...perLetterGroups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([letter, letterAttempts]) => {
      const letterCompleted = letterAttempts.filter(
        (attempt) => attempt.outcome === "completed",
      );
      const predictionCounts = new Map<string, number>();
      for (const attempt of letterAttempts) {
        predictionCounts.set(
          attempt.predictedLabel,
          (predictionCounts.get(attempt.predictedLabel) ?? 0) + 1,
        );
      }
      return {
        letter,
        attempts: letterAttempts.length,
        completed: letterCompleted.length,
        completionRate: letterCompleted.length / letterAttempts.length,
        meanCompletionMs: mean(
          letterCompleted.map((attempt) => attempt.durationMs),
        ),
        predictions: Object.fromEntries(predictionCounts),
      };
    });

  return {
    mode,
    sessionCount: sessions.length,
    totalAttempts,
    completedAttempts: completed.length,
    completionRate: totalAttempts === 0 ? 0 : completed.length / totalAttempts,
    unknownRate:
      totalAttempts === 0
        ? 0
        : attempts.filter((attempt) => attempt.predictedLabel === "UNKNOWN").length /
          totalAttempts,
    detectorMissRate:
      totalAttempts === 0
        ? 0
        : attempts.filter((attempt) => attempt.detectedHands === 0).length /
          totalAttempts,
    meanFps: mean(attempts.map((attempt) => attempt.fps)),
    meanInferenceMs: mean(attempts.map((attempt) => attempt.inferenceMs)),
    meanCompletionMs: mean(completed.map((attempt) => attempt.durationMs)),
    perLetter,
  };
}
