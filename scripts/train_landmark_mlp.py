from __future__ import annotations

import argparse
import copy
import csv
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, classification_report, f1_score
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler

try:
    from artifact_provenance import artifact_generation_key, sha256_file
    from detector_profiles import DETECTOR_PROFILES, INFERENCE_POLICY, RECOVERY_POLICY
except ModuleNotFoundError:
    from scripts.artifact_provenance import artifact_generation_key, sha256_file
    from scripts.detector_profiles import DETECTOR_PROFILES, INFERENCE_POLICY, RECOVERY_POLICY


RANDOM_SEED = 20260825
HIDDEN_LAYERS = (128, 64)
COMPLETE_REASONS = ("ok", "hard_negative")
FEATURE_VERSION = "hand-pose-v2"
FEATURE_COUNT = 132


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def validate_landmark_artifacts(
    project_root: Path,
    landmark_root: Path,
    mode: str,
    data: Any,
) -> dict[str, Any]:
    state_path = landmark_root / f"{mode}-extraction-state.json"
    if not state_path.is_file():
        raise ValueError(f"Missing extraction state: {state_path}. Re-run landmark extraction.")
    state = json.loads(state_path.read_text(encoding="utf-8"))
    if state.get("status") != "complete":
        raise ValueError(f"Landmark extraction for {mode} is not complete.")
    if state.get("feature_version") != FEATURE_VERSION or state.get("feature_count") != FEATURE_COUNT:
        raise ValueError("Landmark feature schema does not match the trainer.")

    manifest_path = project_root / "dataset" / "manifests" / f"{mode}-static.csv"
    manifest_sha256 = sha256_file(manifest_path)
    model_path = Path(state["model_path"])
    if not model_path.is_absolute():
        model_path = project_root / model_path
    if not model_path.is_file():
        raise ValueError(f"Landmark detector model is missing: {model_path}")
    model_sha256 = sha256_file(model_path)
    expected_key = artifact_generation_key(
        FEATURE_VERSION,
        FEATURE_COUNT,
        manifest_sha256,
        model_sha256,
        DETECTOR_PROFILES[mode],
        RECOVERY_POLICY,
    )
    if state.get("generation_key") != expected_key:
        raise ValueError("Landmark extraction state is stale for the current manifest or detector profile.")

    summary_path = landmark_root / f"{mode}-landmark-summary.json"
    if not summary_path.is_file():
        raise ValueError(f"Missing landmark summary: {summary_path}")
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if summary.get("generation_key") != expected_key:
        raise ValueError("Landmark summary does not match the extraction state.")
    required_arrays = {"generation_key", "manifest_sha256", "model_sha256", "feature_version"}
    if not required_arrays.issubset(data.files):
        raise ValueError("Consolidated landmark artifact has no provenance metadata.")
    if str(data["generation_key"].item()) != expected_key:
        raise ValueError("Consolidated landmark artifact is stale.")
    if str(data["manifest_sha256"].item()) != manifest_sha256:
        raise ValueError("Consolidated landmark manifest hash is stale.")
    if str(data["model_sha256"].item()) != model_sha256:
        raise ValueError("Consolidated landmark detector hash is stale.")
    if str(data["feature_version"].item()) != FEATURE_VERSION:
        raise ValueError("Consolidated landmark feature version is stale.")
    return {
        "generation_key": expected_key,
        "manifest_sha256": manifest_sha256,
        "model_sha256": model_sha256,
        "detector_profile": DETECTOR_PROFILES[mode],
        "recovery_policy": RECOVERY_POLICY,
    }


def complete_rows(reasons: np.ndarray) -> np.ndarray:
    return np.isin(reasons, COMPLETE_REASONS)


def candidate_rows(
    name: str, reasons: np.ndarray, strategies: np.ndarray
) -> np.ndarray:
    if name == "strict":
        return complete_rows(reasons)
    if name == "primary_only":
        return complete_rows(reasons) & (strategies == "full_frame")
    return np.ones(len(reasons), dtype=bool)


def mirror_features(features: np.ndarray) -> np.ndarray:
    mirrored = features.copy()
    first = features[:, 0:63].copy()
    second = features[:, 63:126].copy()
    two_hands = (features[:, 126] == 1) & (features[:, 127] == 1)

    mirrored[:, 0:63] = first
    mirrored[:, 63:126] = second
    mirrored[:, 0:63:3] *= -1
    mirrored[:, 63:126:3] *= -1

    mirrored[two_hands, 0:63] = second[two_hands]
    mirrored[two_hands, 63:126] = first[two_hands]
    mirrored[two_hands, 0:63:3] *= -1
    mirrored[two_hands, 63:126:3] *= -1
    mirrored[two_hands, 129] *= -1
    mirrored[two_hands, 131] *= -1
    return mirrored


def cell_weights(
    labels: np.ndarray, sources: np.ndarray, reasons: np.ndarray
) -> np.ndarray:
    counts = Counter(zip(sources.tolist(), labels.tolist(), strict=True))
    weights = np.asarray(
        [1.0 / counts[(source, label)] for source, label in zip(sources, labels, strict=True)],
        dtype=np.float64,
    )
    weights[reasons == "partial_hands"] *= 0.5
    return weights / weights.mean()


def threshold_predictions(
    probabilities: np.ndarray,
    classes: np.ndarray,
    threshold: float,
    features: np.ndarray,
    expected_hands: dict[str, int],
) -> np.ndarray:
    indices = probabilities.argmax(axis=1)
    predictions = classes[indices].astype("U32")
    predictions[probabilities.max(axis=1) < threshold] = "UNKNOWN"
    detected_hands = features[:, 126:128].sum(axis=1)
    for index, prediction in enumerate(predictions):
        if detected_hands[index] != expected_hands[prediction]:
            predictions[index] = "UNKNOWN"
    return predictions


def calibrate_threshold(
    probabilities: np.ndarray,
    labels: np.ndarray,
    classes: np.ndarray,
    features: np.ndarray,
    expected_hands: dict[str, int],
) -> tuple[float, dict[str, float]]:
    candidates = []
    unknown = labels == "UNKNOWN"
    for threshold in np.linspace(0.0, 0.99, 100):
        predictions = threshold_predictions(
            probabilities,
            classes,
            float(threshold),
            features,
            expected_hands,
        )
        false_acceptance = float(np.mean(predictions[unknown] != "UNKNOWN"))
        macro_f1 = float(
            f1_score(labels, predictions, labels=classes, average="macro", zero_division=0)
        )
        if false_acceptance <= 0.05:
            candidates.append((macro_f1, -float(threshold), false_acceptance))
    if not candidates:
        return 1.0, {"macro_f1": 0.0, "unknown_false_acceptance": 0.0}
    macro_f1, negative_threshold, false_acceptance = max(candidates)
    return -negative_threshold, {
        "macro_f1": macro_f1,
        "unknown_false_acceptance": false_acceptance,
    }


def train_candidate(
    name: str,
    train_features: np.ndarray,
    train_labels: np.ndarray,
    train_sources: np.ndarray,
    train_reasons: np.ndarray,
    train_strategies: np.ndarray,
    val_features: np.ndarray,
    val_labels: np.ndarray,
    val_reasons: np.ndarray,
    classes: np.ndarray,
    expected_hands: dict[str, int],
    epochs: int,
    patience: int,
) -> tuple[MLPClassifier, StandardScaler, dict[str, Any]]:
    keep = candidate_rows(name, train_reasons, train_strategies)

    selected_features = train_features[keep]
    selected_labels = train_labels[keep].copy()
    selected_sources = train_sources[keep]
    selected_reasons = train_reasons[keep]
    if name == "reject_partial":
        selected_labels[selected_reasons == "partial_hands"] = "UNKNOWN"
    weights = cell_weights(selected_labels, selected_sources, selected_reasons)

    augmented_features = np.concatenate(
        [selected_features, mirror_features(selected_features)], axis=0
    )
    augmented_labels = np.concatenate([selected_labels, selected_labels])
    augmented_weights = np.concatenate([weights, weights])
    scaler = StandardScaler().fit(augmented_features)
    scaled_train = scaler.transform(augmented_features)
    scaled_val = scaler.transform(val_features)

    model = MLPClassifier(
        hidden_layer_sizes=HIDDEN_LAYERS,
        activation="relu",
        solver="adam",
        alpha=0.0005,
        batch_size=256,
        learning_rate_init=0.001,
        max_iter=1,
        shuffle=False,
        random_state=RANDOM_SEED,
    )
    rng = np.random.default_rng(RANDOM_SEED)
    best_model = None
    best_f1 = -1.0
    stale_epochs = 0
    history = []
    for epoch in range(1, epochs + 1):
        order = rng.permutation(len(scaled_train))
        kwargs = {"classes": classes} if epoch == 1 else {}
        model.partial_fit(
            scaled_train[order],
            augmented_labels[order],
            sample_weight=augmented_weights[order],
            **kwargs,
        )
        complete_validation = complete_rows(val_reasons)
        predictions = model.predict(scaled_val[complete_validation])
        macro_f1 = float(
            f1_score(
                val_labels[complete_validation],
                predictions,
                labels=classes,
                average="macro",
                zero_division=0,
            )
        )
        history.append({"epoch": epoch, "validation_macro_f1": macro_f1})
        print(f"{name}: epoch {epoch}, val macro-F1={macro_f1:.4f}")
        if macro_f1 > best_f1 + 1e-4:
            best_model = copy.deepcopy(model)
            best_f1 = macro_f1
            stale_epochs = 0
        else:
            stale_epochs += 1
            if stale_epochs >= patience:
                break

    if best_model is None:
        raise RuntimeError(f"{name} did not produce a model")
    probabilities = best_model.predict_proba(scaled_val)
    complete_validation = complete_rows(val_reasons)
    threshold, calibrated = calibrate_threshold(
        probabilities[complete_validation],
        val_labels[complete_validation],
        best_model.classes_,
        val_features[complete_validation],
        expected_hands,
    )
    return best_model, scaler, {
        "name": name,
        "training_samples": int(len(selected_features)),
        "augmented_training_samples": int(len(augmented_features)),
        "best_unthresholded_macro_f1": best_f1,
        "epochs_trained": len(history),
        "confidence_threshold": threshold,
        "calibrated_validation": calibrated,
        "history": history,
    }


def metric_block(
    model: MLPClassifier,
    scaler: StandardScaler,
    features: np.ndarray,
    labels: np.ndarray,
    classes: np.ndarray,
    threshold: float,
    expected_hands: dict[str, int],
) -> dict[str, Any]:
    if len(labels) == 0:
        return {"sample_count": 0}
    probabilities = model.predict_proba(scaler.transform(features))
    predictions = threshold_predictions(
        probabilities,
        model.classes_,
        threshold,
        features,
        expected_hands,
    )
    unknown = labels == "UNKNOWN"
    return {
        "sample_count": int(len(labels)),
        "accuracy": float(accuracy_score(labels, predictions)),
        "macro_f1": float(
            f1_score(labels, predictions, labels=classes, average="macro", zero_division=0)
        ),
        "unknown_false_acceptance": float(np.mean(predictions[unknown] != "UNKNOWN"))
        if unknown.any()
        else None,
        "unknown_prediction_rate": float(np.mean(predictions == "UNKNOWN")),
        "report": classification_report(
            labels,
            predictions,
            labels=classes,
            output_dict=True,
            zero_division=0,
        ),
    }


def evaluate(
    model: MLPClassifier,
    scaler: StandardScaler,
    features: np.ndarray,
    labels: np.ndarray,
    sources: np.ndarray,
    reasons: np.ndarray,
    classes: np.ndarray,
    threshold: float,
    expected_hands: dict[str, int],
) -> dict[str, Any]:
    result = {
        "all": metric_block(
            model, scaler, features, labels, classes, threshold, expected_hands
        ),
        "complete": metric_block(
            model,
            scaler,
            features[complete_rows(reasons)],
            labels[complete_rows(reasons)],
            classes,
            threshold,
            expected_hands,
        ),
        "partial": metric_block(
            model,
            scaler,
            features[reasons == "partial_hands"],
            labels[reasons == "partial_hands"],
            classes,
            threshold,
            expected_hands,
        ),
        "by_source": {},
    }
    for source in sorted(set(sources.tolist())):
        selected = sources == source
        result["by_source"][source] = metric_block(
            model,
            scaler,
            features[selected],
            labels[selected],
            classes,
            threshold,
            expected_hands,
        )
    return result


def end_to_end_metric(
    model: MLPClassifier,
    scaler: StandardScaler,
    features: np.ndarray,
    labels: np.ndarray,
    usable: np.ndarray,
    classes: np.ndarray,
    threshold: float,
    expected_hands: dict[str, int],
) -> dict[str, Any]:
    predictions = np.full(len(labels), "UNKNOWN", dtype="U32")
    if usable.any():
        probabilities = model.predict_proba(scaler.transform(features[usable]))
        predictions[usable] = threshold_predictions(
            probabilities,
            model.classes_,
            threshold,
            features[usable],
            expected_hands,
        )
    unknown = labels == "UNKNOWN"
    return {
        "sample_count": int(len(labels)),
        "landmark_coverage": float(usable.mean()),
        "accuracy": float(accuracy_score(labels, predictions)),
        "macro_f1": float(
            f1_score(labels, predictions, labels=classes, average="macro", zero_division=0)
        ),
        "unknown_false_acceptance": float(np.mean(predictions[unknown] != "UNKNOWN"))
        if unknown.any()
        else None,
        "report": classification_report(
            labels,
            predictions,
            labels=classes,
            output_dict=True,
            zero_division=0,
        ),
    }


def export_model(
    path: Path,
    mode: str,
    model: MLPClassifier,
    scaler: StandardScaler,
    threshold: float,
    expected_hands: dict[str, int],
    provenance: dict[str, Any],
) -> None:
    payload = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": mode.upper(),
        "featureVersion": FEATURE_VERSION,
        "featureCount": int(model.n_features_in_),
        "classes": model.classes_.tolist(),
        "confidenceThreshold": threshold,
        "expectedHands": expected_hands,
        "inferencePolicy": INFERENCE_POLICY,
        "landmarkGenerationKey": provenance["generation_key"],
        "detectorProfile": provenance["detector_profile"],
        "qualityGate": "return UNKNOWN when detected hands do not match the predicted class route",
        "scaler": {
            "mean": scaler.mean_.tolist(),
            "scale": scaler.scale_.tolist(),
        },
        "layers": [
            {
                "inputSize": int(weights.shape[0]),
                "outputSize": int(weights.shape[1]),
                "activation": "softmax" if index == len(model.coefs_) - 1 else "relu",
                "weights": weights.tolist(),
                "bias": model.intercepts_[index].tolist(),
            }
            for index, weights in enumerate(model.coefs_)
        ],
    }
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")


def verify_export(
    model: MLPClassifier, scaler: StandardScaler, features: np.ndarray
) -> float:
    scaled = scaler.transform(features)
    output = scaled
    for index, (weights, bias) in enumerate(zip(model.coefs_, model.intercepts_, strict=True)):
        output = output @ weights + bias
        if index < len(model.coefs_) - 1:
            output = np.maximum(output, 0)
        else:
            output -= output.max(axis=1, keepdims=True)
            output = np.exp(output)
            output /= output.sum(axis=1, keepdims=True)
    expected = model.predict_proba(scaled)
    return float(np.max(np.abs(output - expected)))


def export_parity_fixture(
    path: Path,
    mode: str,
    model: MLPClassifier,
    scaler: StandardScaler,
    features: np.ndarray,
) -> None:
    if len(features) == 0:
        raise ValueError("Cannot export an empty parity fixture")
    probabilities = model.predict_proba(scaler.transform(features[:1]))[0]
    best_index = int(probabilities.argmax())
    payload = {
        "schemaVersion": 1,
        "mode": mode.upper(),
        "featureVersion": FEATURE_VERSION,
        "features": features[0].tolist(),
        "label": str(model.classes_[best_index]),
        "confidence": float(probabilities[best_index]),
        "probabilities": probabilities.tolist(),
    }
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a browser-exportable landmark MLP.")
    parser.add_argument("--mode", choices=("bisindo", "asl"), required=True)
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--patience", type=int, default=8)
    parser.add_argument(
        "--evaluate-test",
        action="store_true",
        help="Evaluate the locked model on the holdout test split.",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    landmark_root = project_root / "dataset" / "processed" / "landmarks"
    rows = load_rows(landmark_root / f"{args.mode}-landmarks.csv")
    with np.load(landmark_root / f"{args.mode}-static.npz", allow_pickle=False) as data:
        provenance = validate_landmark_artifacts(project_root, landmark_root, args.mode, data)
        features = data["features"].astype(np.float64)
        sample_ids = data["sample_ids"]
        usable = data["usable"]
        reasons = data["reasons"]
    if not all(sample_id == row["sample_id"] for sample_id, row in zip(sample_ids, rows, strict=True)):
        raise ValueError("NPZ sample order does not match landmark index")

    labels = np.asarray([row["label"] for row in rows])
    splits = np.asarray([row["split"] for row in rows])
    sources = np.asarray([row["source"] for row in rows])
    strategies = np.asarray([row["detection_strategy"] for row in rows])
    with (project_root / "dataset" / "manifests" / "class-spec.json").open(
        "r", encoding="utf-8"
    ) as stream:
        class_spec = json.load(stream)
    classes = np.asarray(class_spec["modes"][args.mode]["output_labels"])
    mode_spec = class_spec["modes"][args.mode]
    expected_hands = {
        **{label: 1 for label in mode_spec["one_hand_static"]},
        **{label: 2 for label in mode_spec["two_hand_static"]},
        "UNKNOWN": 0,
    }

    train = (splits == "train") & usable
    validation = (splits == "val") & usable
    test = (splits == "test") & usable
    candidates = []
    candidate_names = ["strict"]
    if np.any(reasons[train] == "partial_hands"):
        candidate_names.append("reject_partial")
    if np.any(strategies[train] == "threshold_fallback_020"):
        candidate_names.append("primary_only")
    for name in candidate_names:
        model, scaler, training = train_candidate(
            name,
            features[train],
            labels[train],
            sources[train],
            reasons[train],
            strategies[train],
            features[validation],
            labels[validation],
            reasons[validation],
            classes,
            expected_hands,
            args.epochs,
            args.patience,
        )
        threshold = training["confidence_threshold"]
        validation_metrics = evaluate(
            model,
            scaler,
            features[validation],
            labels[validation],
            sources[validation],
            reasons[validation],
            classes,
            threshold,
            expected_hands,
        )
        candidates.append((model, scaler, training, validation_metrics))

    model, scaler, training, validation_metrics = max(
        candidates,
        key=lambda candidate: (
            candidate[3]["complete"]["macro_f1"],
            candidate[3]["all"]["macro_f1"],
        ),
    )
    threshold = training["confidence_threshold"]
    test_metrics: dict[str, Any] = {"status": "not_evaluated"}
    if args.evaluate_test:
        test_metrics = evaluate(
            model,
            scaler,
            features[test],
            labels[test],
            sources[test],
            reasons[test],
            classes,
            threshold,
            expected_hands,
        )
        test_all = splits == "test"
        test_metrics["end_to_end"] = end_to_end_metric(
            model,
            scaler,
            features[test_all],
            labels[test_all],
            usable[test_all],
            classes,
            threshold,
            expected_hands,
        )
    parity_features = features[test][:100] if args.evaluate_test else features[validation][:100]
    parity_error = verify_export(model, scaler, parity_features)
    if parity_error > 1e-10:
        raise ValueError(f"Export parity error is too high: {parity_error}")

    model_root = project_root / "models" / args.mode
    model_root.mkdir(parents=True, exist_ok=True)
    export_model(
        model_root / "landmark-mlp.json",
        args.mode,
        model,
        scaler,
        threshold,
        expected_hands,
        provenance,
    )
    export_parity_fixture(
        model_root / "parity-fixture.json",
        args.mode,
        model,
        scaler,
        features[validation],
    )
    joblib.dump(
        {
            "model": model,
            "scaler": scaler,
            "confidence_threshold": threshold,
            "expected_hands": expected_hands,
            "inference_policy": INFERENCE_POLICY,
            "landmark_provenance": provenance,
        },
        model_root / "landmark-mlp.joblib",
    )
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": args.mode.upper(),
        "feature_version": FEATURE_VERSION,
        "classes": classes.tolist(),
        "selection_split": "val",
        "selection_metric": "complete-hand validation macro-F1",
        "holdout_split": "test",
        "holdout_evaluated": args.evaluate_test,
        "expected_hands": expected_hands,
        "inference_policy": INFERENCE_POLICY,
        "landmark_provenance": provenance,
        "candidate_validation": [
            {"training": candidate[2], "validation": candidate[3]}
            for candidate in candidates
        ],
        "selected_candidate": training["name"],
        "confidence_threshold": threshold,
        "validation": validation_metrics,
        "test": test_metrics,
        "export_max_probability_error": parity_error,
    }
    report_path = model_root / "training-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Selected {training['name']} candidate")
    print(f"Validation macro-F1: {validation_metrics['all']['macro_f1']:.4f}")
    if args.evaluate_test:
        print(f"Test macro-F1: {test_metrics['all']['macro_f1']:.4f}")
    else:
        print("Test split was not evaluated. Re-run with --evaluate-test after locking the model.")
    print(f"Wrote {model_root / 'landmark-mlp.json'}")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
