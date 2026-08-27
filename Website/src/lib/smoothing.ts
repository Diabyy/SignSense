import type { GesturePrediction } from "./mlp";

interface TimedPrediction {
  label: string;
  confidence: number;
  timestamp: number;
}

export interface StablePrediction {
  label: string;
  confidence: number;
}

export class PredictionSmoother {
  private readonly samples: TimedPrediction[] = [];

  constructor(
    private readonly windowMs = 420,
    private readonly minimumSamples = 5,
    private readonly minimumRatio = 0.64,
  ) {}

  reset(): void {
    this.samples.length = 0;
  }

  update(prediction: GesturePrediction, timestamp: number): StablePrediction {
    this.samples.push({
      label: prediction.label,
      confidence: prediction.confidence,
      timestamp,
    });
    while (this.samples[0] && timestamp - this.samples[0].timestamp > this.windowMs) {
      this.samples.shift();
    }
    if (this.samples.length < this.minimumSamples) {
      return { label: "UNKNOWN", confidence: 0 };
    }

    const grouped = new Map<string, { count: number; confidence: number }>();
    for (const sample of this.samples) {
      const current = grouped.get(sample.label) ?? { count: 0, confidence: 0 };
      current.count += 1;
      current.confidence += sample.confidence;
      grouped.set(sample.label, current);
    }
    const [label, aggregate] = [...grouped.entries()].sort(
      (first, second) => second[1].count - first[1].count,
    )[0]!;
    const ratio = aggregate.count / this.samples.length;
    if (label === "UNKNOWN" || ratio < this.minimumRatio) {
      return { label: "UNKNOWN", confidence: aggregate.confidence / aggregate.count };
    }
    return { label, confidence: aggregate.confidence / aggregate.count };
  }
}

export class TranscriptLatch {
  private lockedLabel: string | null = null;
  private unknownSince: number | null = null;

  constructor(private readonly releaseMs = 300) {}

  reset(): void {
    this.lockedLabel = null;
    this.unknownSince = null;
  }

  update(prediction: StablePrediction, timestamp: number): string | null {
    if (prediction.label === "UNKNOWN") {
      this.unknownSince ??= timestamp;
      if (timestamp - this.unknownSince >= this.releaseMs) this.lockedLabel = null;
      return null;
    }
    this.unknownSince = null;
    if (prediction.label === this.lockedLabel) return null;
    this.lockedLabel = prediction.label;
    return prediction.label;
  }
}
