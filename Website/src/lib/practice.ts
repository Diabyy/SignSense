export const PRACTICE_HOLD_DURATION_MS = 900;
export const PRACTICE_DECAY_DURATION_MS = 450;
export const PRACTICE_MAX_STEP_MS = 250;

export interface PracticeSample {
  processedAt: number;
  isMatching: boolean;
}

export function isPracticeSnapshotAfterReset(
  snapshotProcessedAt: number,
  resetAt: number,
): boolean {
  return snapshotProcessedAt > resetAt;
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

export function advancePracticeProgress(
  currentProgress: number,
  elapsedMs: number,
  isMatching: boolean,
): number {
  const current = clampProgress(currentProgress);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return current;

  const boundedElapsedMs = Math.min(elapsedMs, PRACTICE_MAX_STEP_MS);
  const duration = isMatching
    ? PRACTICE_HOLD_DURATION_MS
    : PRACTICE_DECAY_DURATION_MS;
  const direction = isMatching ? 1 : -1;
  return clampProgress(current + direction * (boundedElapsedMs / duration) * 100);
}

export function progressFromPracticeSamples(
  currentProgress: number,
  previousSample: PracticeSample | null,
  currentSample: PracticeSample,
): number {
  if (!previousSample) return clampProgress(currentProgress);
  return advancePracticeProgress(
    currentProgress,
    currentSample.processedAt - previousSample.processedAt,
    previousSample.isMatching,
  );
}
