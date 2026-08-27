import { FEATURE_COUNT, FEATURE_VERSION, type FeatureHypothesis } from "./features";

interface SerializedLayer {
  inputSize: number;
  outputSize: number;
  activation: "relu" | "softmax";
  weights: number[][];
  bias: number[];
}

export interface SerializedDetectorProfile {
  primary: Record<string, number>;
  fallback: Record<string, number> | null;
  padding_fallback: { ratio: number; detector: string } | null;
}

export interface SerializedMlpModel {
  schemaVersion: number;
  mode: string;
  featureVersion: string;
  featureCount: number;
  classes: string[];
  confidenceThreshold: number;
  expectedHands: Record<string, number>;
  inferencePolicy?: string;
  landmarkGenerationKey?: string;
  detectorProfile?: SerializedDetectorProfile;
  scaler: {
    mean: number[];
    scale: number[];
  };
  layers: SerializedLayer[];
}

export interface ModelContract {
  mode: string;
  classes: readonly string[];
  inferencePolicy?: string;
  detectorProfile?: SerializedDetectorProfile;
}

interface RuntimeLayer {
  inputSize: number;
  outputSize: number;
  activation: "relu" | "softmax";
  weights: Float32Array;
  bias: Float32Array;
}

export interface ClassPrediction {
  label: string;
  confidence: number;
  probabilities: Float32Array;
}

export interface GesturePrediction extends ClassPrediction {
  featureHands: 0 | 1 | 2;
}

function assertFiniteArray(values: readonly number[], label: string): void {
  if (!values.every(Number.isFinite)) {
    throw new Error(`${label} contains a non-finite value.`);
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function validateModel(model: SerializedMlpModel, contract?: ModelContract): void {
  if (model.schemaVersion !== 1) {
    throw new Error(`Unsupported model schema ${model.schemaVersion}.`);
  }
  if (model.featureVersion !== FEATURE_VERSION || model.featureCount !== FEATURE_COUNT) {
    throw new Error(
      `Model expects ${model.featureVersion}/${model.featureCount}, not ${FEATURE_VERSION}/${FEATURE_COUNT}.`,
    );
  }
  if (model.classes.length < 2 || !model.classes.includes("UNKNOWN")) {
    throw new Error("Model classes must include UNKNOWN.");
  }
  if (
    !Number.isFinite(model.confidenceThreshold) ||
    model.confidenceThreshold < 0 ||
    model.confidenceThreshold > 1
  ) {
    throw new Error("Model confidence threshold is invalid.");
  }
  for (const label of model.classes) {
    if (![0, 1, 2].includes(model.expectedHands[label]!)) {
      throw new Error(`Model has no valid hand-count route for ${label}.`);
    }
  }
  if (model.expectedHands.UNKNOWN !== 0) {
    throw new Error("UNKNOWN must use the zero-hand route.");
  }
  if (contract) {
    if (model.mode !== contract.mode) {
      throw new Error(`Expected ${contract.mode} model, received ${model.mode}.`);
    }
    const actual = [...model.classes].sort();
    const expected = [...contract.classes].sort();
    if (actual.length !== expected.length || actual.some((label, index) => label !== expected[index])) {
      throw new Error(`Model classes do not match the ${contract.mode} mode.`);
    }
    if (contract.inferencePolicy && model.inferencePolicy !== contract.inferencePolicy) {
      throw new Error(`Model inference policy does not match the ${contract.mode} mode.`);
    }
    if (
      contract.detectorProfile &&
      canonicalJson(model.detectorProfile) !== canonicalJson(contract.detectorProfile)
    ) {
      throw new Error(`Model detector profile does not match the ${contract.mode} mode.`);
    }
  }
  if (model.scaler.mean.length !== FEATURE_COUNT || model.scaler.scale.length !== FEATURE_COUNT) {
    throw new Error("Model scaler does not match the feature count.");
  }
  assertFiniteArray(model.scaler.mean, "Scaler mean");
  assertFiniteArray(model.scaler.scale, "Scaler scale");
  if (model.layers.length === 0) {
    throw new Error("Model has no layers.");
  }

  let expectedInput = FEATURE_COUNT;
  model.layers.forEach((layer, layerIndex) => {
    if (layer.inputSize !== expectedInput || layer.weights.length !== layer.inputSize) {
      throw new Error(`Layer ${layerIndex} has an invalid input size.`);
    }
    if (layer.bias.length !== layer.outputSize) {
      throw new Error(`Layer ${layerIndex} has an invalid bias size.`);
    }
    for (const row of layer.weights) {
      if (row.length !== layer.outputSize) {
        throw new Error(`Layer ${layerIndex} has an invalid weight row.`);
      }
      assertFiniteArray(row, `Layer ${layerIndex} weights`);
    }
    assertFiniteArray(layer.bias, `Layer ${layerIndex} bias`);
    expectedInput = layer.outputSize;
  });
  if (expectedInput !== model.classes.length) {
    throw new Error("Output layer does not match the model classes.");
  }
}

function flattenLayer(layer: SerializedLayer): RuntimeLayer {
  const weights = new Float32Array(layer.inputSize * layer.outputSize);
  for (let input = 0; input < layer.inputSize; input += 1) {
    const row = layer.weights[input]!;
    for (let output = 0; output < layer.outputSize; output += 1) {
      weights[input * layer.outputSize + output] = row[output]!;
    }
  }
  return {
    inputSize: layer.inputSize,
    outputSize: layer.outputSize,
    activation: layer.activation,
    weights,
    bias: Float32Array.from(layer.bias),
  };
}

export class LandmarkMlp {
  readonly mode: string;
  readonly classes: readonly string[];
  readonly confidenceThreshold: number;
  readonly expectedHands: Readonly<Record<string, number>>;

  private readonly mean: Float32Array;
  private readonly scale: Float32Array;
  private readonly layers: RuntimeLayer[];

  constructor(model: SerializedMlpModel, contract?: ModelContract) {
    validateModel(model, contract);
    this.mode = model.mode;
    this.classes = model.classes;
    this.confidenceThreshold = model.confidenceThreshold;
    this.expectedHands = model.expectedHands;
    this.mean = Float32Array.from(model.scaler.mean);
    this.scale = Float32Array.from(model.scaler.scale);
    this.layers = model.layers.map(flattenLayer);
  }

  predict(features: Float32Array): ClassPrediction {
    if (features.length !== FEATURE_COUNT) {
      throw new Error(`Expected ${FEATURE_COUNT} features, received ${features.length}.`);
    }
    let values = new Float32Array(FEATURE_COUNT);
    for (let index = 0; index < FEATURE_COUNT; index += 1) {
      values[index] = (features[index]! - this.mean[index]!) / this.scale[index]!;
    }

    this.layers.forEach((layer) => {
      const output = new Float32Array(layer.outputSize);
      for (let outputIndex = 0; outputIndex < layer.outputSize; outputIndex += 1) {
        let value = layer.bias[outputIndex]!;
        for (let inputIndex = 0; inputIndex < layer.inputSize; inputIndex += 1) {
          value +=
            values[inputIndex]! *
            layer.weights[inputIndex * layer.outputSize + outputIndex]!;
        }
        output[outputIndex] = layer.activation === "relu" ? Math.max(0, value) : value;
      }
      if (layer.activation === "softmax") {
        let maximum = Number.NEGATIVE_INFINITY;
        for (const value of output) maximum = Math.max(maximum, value);
        let total = 0;
        for (let index = 0; index < output.length; index += 1) {
          output[index] = Math.exp(output[index]! - maximum);
          total += output[index]!;
        }
        for (let index = 0; index < output.length; index += 1) {
          output[index] = output[index]! / total;
        }
      }
      values = output;
    });

    let bestIndex = 0;
    for (let index = 1; index < values.length; index += 1) {
      if (values[index]! > values[bestIndex]!) bestIndex = index;
    }
    return {
      label: this.classes[bestIndex]!,
      confidence: values[bestIndex]!,
      probabilities: values,
    };
  }

  predictHypotheses(hypotheses: readonly FeatureHypothesis[]): GesturePrediction {
    if (hypotheses.length === 0) {
      return {
        label: "UNKNOWN",
        confidence: 1,
        probabilities: new Float32Array(this.classes.length),
        featureHands: 0,
      };
    }

    let best: GesturePrediction | null = null;
    let bestUnknown: GesturePrediction | null = null;
    for (const hypothesis of hypotheses) {
      const prediction = this.predict(hypothesis.features);
      const unknownIndex = this.classes.indexOf("UNKNOWN");
      const unknownConfidence = unknownIndex >= 0 ? prediction.probabilities[unknownIndex]! : 0;
      const unknownCandidate: GesturePrediction = {
        label: "UNKNOWN",
        confidence: unknownConfidence,
        probabilities: prediction.probabilities,
        featureHands: hypothesis.featureHands,
      };
      if (bestUnknown === null || unknownCandidate.confidence > bestUnknown.confidence) {
        bestUnknown = unknownCandidate;
      }

      if (
        prediction.label === "UNKNOWN" ||
        prediction.confidence < this.confidenceThreshold ||
        hypothesis.featureHands !== this.expectedHands[prediction.label]!
      ) {
        continue;
      }
      const candidate: GesturePrediction = {
        label: prediction.label,
        confidence: prediction.confidence,
        probabilities: prediction.probabilities,
        featureHands: hypothesis.featureHands,
      };
      if (best === null || candidate.confidence > best.confidence) best = candidate;
    }
    return best ?? bestUnknown!;
  }
}

export async function loadLandmarkMlp(
  url: string,
  contract?: ModelContract,
  signal?: AbortSignal,
): Promise<LandmarkMlp> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Could not load the classifier (${response.status}).`);
  }
  return new LandmarkMlp((await response.json()) as SerializedMlpModel, contract);
}
