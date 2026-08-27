import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FEATURE_COUNT } from "../src/lib/features";
import { MODE_CONFIGS, type SignMode } from "../src/lib/modes";
import {
  LandmarkMlp,
  validateModel,
  type SerializedMlpModel,
} from "../src/lib/mlp";

const parityFeatures = Float32Array.from([
  0,0,0,0.34460184,0.083752856,-0.20524512,0.8687805,-0.090395555,-0.30480024,
  1.2792174,-0.2197762,-0.38310602,1.5969148,-0.2088074,-0.4485421,0.8209178,
  -0.6662347,-0.26474965,1.1565266,-1.0767473,-0.4298459,1.3815521,-1.3157284,
  -0.50694513,1.5454173,-1.5586712,-0.5676524,0.59788215,-0.80158395,-0.26078302,
  0.8049232,-0.87464833,-0.47251907,0.60274005,-0.49248388,-0.45166785,0.50299716,
  -0.41452253,-0.39907885,0.3381961,-0.86215657,-0.28170186,0.5323269,-0.9271021,
  -0.51783764,0.378188,-0.5795617,-0.4110472,0.30259293,-0.55048186,-0.2926364,
  0.06390105,-0.89825797,-0.31860527,0.22031298,-0.97208798,-0.470023,0.18090786,
  -0.7261931,-0.3895908,0.12185435,-0.6993596,-0.30620724,0,0,0,-0.3555717,
  -0.009718614,-0.10078043,-0.7530464,-0.15947743,-0.19434978,-1.085239,-0.19813985,
  -0.29640046,-1.3386059,-0.17020567,-0.4000711,-0.7746061,-0.6807191,-0.15509747,
  -1.1149305,-0.9731129,-0.3182416,-1.3371801,-1.1804961,-0.43543792,-1.5185014,
  -1.3563076,-0.53139246,-0.5781408,-0.81593704,-0.1952769,-0.813967,-0.6858261,
  -0.4177756,-0.65733933,-0.39234236,-0.4621922,-0.51397055,-0.29202548,-0.4569745,
  -0.3403105,-0.8521361,-0.25074995,-0.5688015,-0.6867855,-0.4084788,-0.45149598,
  -0.43770352,-0.32831958,-0.33494294,-0.40307614,-0.25314137,-0.08516902,-0.83460444,
  -0.32449752,-0.30146065,-0.74011874,-0.40867555,-0.27721334,-0.53897977,-0.33942726,
  -0.19449078,-0.51589453,-0.27400017,1,1,3.224234,-0.04790166,3.2245898,0.10131365,
]);

interface ParityFixture {
  features: number[];
  label: string;
  confidence: number;
}

function loadRealModel(mode: SignMode): SerializedMlpModel {
  const path = new URL(`../../models/${mode}/landmark-mlp.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as SerializedMlpModel;
}

function loadParityFixture(mode: SignMode): ParityFixture {
  const path = new URL(`../../models/${mode}/parity-fixture.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as ParityFixture;
}

function tinyModel(): SerializedMlpModel {
  const weights = Array.from({ length: FEATURE_COUNT }, () => [0, 0]);
  return {
    schemaVersion: 1,
    mode: "TEST",
    featureVersion: "hand-pose-v2",
    featureCount: FEATURE_COUNT,
    classes: ["A", "UNKNOWN"],
    confidenceThreshold: 0.5,
    expectedHands: { A: 2, UNKNOWN: 0 },
    scaler: {
      mean: Array.from({ length: FEATURE_COUNT }, () => 0),
      scale: Array.from({ length: FEATURE_COUNT }, () => 1),
    },
    layers: [{ inputSize: FEATURE_COUNT, outputSize: 2, activation: "softmax", weights, bias: [3, 0] }],
  };
}

function routingModel(): SerializedMlpModel {
  const weights = Array.from({ length: FEATURE_COUNT }, () => [0, 0]);
  return {
    ...tinyModel(),
    confidenceThreshold: 0.48,
    expectedHands: { A: 1, UNKNOWN: 0 },
    layers: [{
      inputSize: FEATURE_COUNT,
      outputSize: 2,
      activation: "softmax",
      weights,
      bias: [Math.log(0.49), Math.log(0.51)],
    }],
  };
}

describe("LandmarkMlp", () => {
  it("matches the exported Python model on a real feature fixture", () => {
    const model = new LandmarkMlp(loadRealModel("bisindo"));
    const prediction = model.predict(parityFeatures);

    expect(parityFeatures).toHaveLength(FEATURE_COUNT);
    expect(prediction.label).toBe("A");
    expect(prediction.confidence).toBeCloseTo(0.9999685, 4);
  });

  it("matches the exported ASL Python model on a real feature fixture", () => {
    const model = new LandmarkMlp(loadRealModel("asl"));
    const fixture = loadParityFixture("asl");
    const prediction = model.predict(Float32Array.from(fixture.features));

    expect(fixture.features).toHaveLength(FEATURE_COUNT);
    expect(prediction.label).toBe(fixture.label);
    expect(prediction.confidence).toBeCloseTo(fixture.confidence, 5);
  });

  it.each(["bisindo", "asl"] as const)("validates the %s deployment contract", (mode) => {
    const config = MODE_CONFIGS[mode];
    const model = loadRealModel(mode);

    expect(() =>
      validateModel(model, {
        mode: config.modelMode,
        classes: [...config.staticLetters, "UNKNOWN"],
        inferencePolicy: config.modelInferencePolicy,
        detectorProfile: config.modelDetectorProfile,
      }),
    ).not.toThrow();
  });

  it("enforces the hand-count route for gesture hypotheses", () => {
    const model = new LandmarkMlp(tinyModel());
    const oneHand = model.predictHypotheses([
      { features: new Float32Array(FEATURE_COUNT), featureHands: 1 },
    ]);
    const twoHands = model.predictHypotheses([
      { features: new Float32Array(FEATURE_COUNT), featureHands: 2 },
    ]);

    expect(oneHand.label).toBe("UNKNOWN");
    expect(twoHands.label).toBe("A");
  });

  it("does not route a one-hand class through a two-hand hypothesis", () => {
    const serialized = tinyModel();
    serialized.expectedHands = { A: 1, UNKNOWN: 0 };
    const model = new LandmarkMlp(serialized);

    const prediction = model.predictHypotheses([
      { features: new Float32Array(FEATURE_COUNT), featureHands: 2 },
    ]);

    expect(prediction.label).toBe("UNKNOWN");
  });

  it("does not promote a lower compatible class over the global UNKNOWN argmax", () => {
    const model = new LandmarkMlp(routingModel());
    const prediction = model.predictHypotheses([
      { features: new Float32Array(FEATURE_COUNT), featureHands: 1 },
    ]);

    expect(prediction.label).toBe("UNKNOWN");
    expect(prediction.confidence).toBeCloseTo(0.51, 6);
  });

  it("rejects a model with the wrong feature schema", () => {
    const model = tinyModel();
    model.featureCount = 130;
    expect(() => validateModel(model)).toThrow(/expects/);
  });

  it("rejects a classifier loaded for the wrong mode", () => {
    const model = loadRealModel("asl");
    expect(() =>
      validateModel(model, {
        mode: "BISINDO",
        classes: [...MODE_CONFIGS.bisindo.staticLetters, "UNKNOWN"],
      }),
    ).toThrow(/Expected BISINDO/);
  });
});
