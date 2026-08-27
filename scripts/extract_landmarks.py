from __future__ import annotations

import argparse
import csv
import hashlib
import json
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from contextlib import ExitStack
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from artifact_provenance import artifact_generation_key, sha256_file, write_json_atomic
from detector_profiles import DETECTOR_PROFILES, RECOVERY_POLICY
from landmark_features import FEATURE_SIZE, FEATURE_VERSION, build_feature, feature_names


def load_manifest(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def profile_tag(value: float) -> str:
    return f"{round(value * 100):03d}"


def chunk_key(
    rows: list[dict[str, str]],
    generation_key: str,
    chunk_index: int,
) -> str:
    digest = hashlib.sha256()
    digest.update(generation_key.encode("ascii"))
    digest.update(str(chunk_index).encode("ascii"))
    for row in rows:
        digest.update(row["sample_id"].encode("ascii"))
        digest.update(row["content_sha256"].encode("ascii"))
        digest.update(row["expected_hands"].encode("ascii"))
    return digest.hexdigest()


def valid_chunk(path: Path, expected_key: str, expected_rows: int) -> bool:
    if not path.is_file():
        return False
    try:
        with np.load(path, allow_pickle=False) as data:
            return (
                str(data["chunk_key"].item()) == expected_key
                and int(data["features"].shape[0]) == expected_rows
                and int(data["features"].shape[1]) == FEATURE_SIZE
            )
    except Exception:
        return False


def result_arrays(
    result: Any,
    image_width: int,
    image_height: int,
    offset_x: int = 0,
    offset_y: int = 0,
) -> tuple[list[np.ndarray], list[str], list[float]]:
    landmarks = [
        np.asarray(
            [
                [
                    offset_x + point.x * image_width,
                    offset_y + point.y * image_height,
                    point.z * image_width,
                ]
                for point in hand
            ],
            dtype=np.float32,
        )
        for hand in result.hand_landmarks
    ]
    handedness = []
    scores = []
    for categories in result.handedness:
        if categories:
            handedness.append(categories[0].category_name or "Unknown")
            scores.append(float(categories[0].score or 0.0))
        else:
            handedness.append("Unknown")
            scores.append(0.0)
    return landmarks, handedness, scores


def xml_crop(
    image: np.ndarray, image_path: Path, margin: float
) -> tuple[np.ndarray, int, int] | None:
    xml_path = image_path.with_suffix(".xml")
    if not xml_path.is_file():
        return None
    root = ET.parse(xml_path).getroot()
    boxes = root.findall("object/bndbox")
    if len(boxes) != 1:
        return None

    box = boxes[0]
    xmin = float(box.findtext("xmin") or 0)
    ymin = float(box.findtext("ymin") or 0)
    xmax = float(box.findtext("xmax") or 0)
    ymax = float(box.findtext("ymax") or 0)
    width = xmax - xmin
    height = ymax - ymin
    if width <= 0 or height <= 0:
        return None

    center_x = (xmin + xmax) / 2
    center_y = (ymin + ymax) / 2
    side = max(width, height) * (1 + 2 * margin)
    image_height, image_width = image.shape[:2]
    left = max(0, int(round(center_x - side / 2)))
    top = max(0, int(round(center_y - side / 2)))
    right = min(image_width, int(round(center_x + side / 2)))
    bottom = min(image_height, int(round(center_y + side / 2)))
    if right - left < 32 or bottom - top < 32:
        return None
    return np.ascontiguousarray(image[top:bottom, left:right]), left, top


def detect_landmarks(
    detector: vision.HandLandmarker,
    image: mp.Image,
    offset_x: int = 0,
    offset_y: int = 0,
) -> tuple[list[np.ndarray], list[str], list[float]]:
    result = detector.detect(image)
    return result_arrays(result, image.width, image.height, offset_x, offset_y)


def pad_image(image: mp.Image, ratio: float) -> mp.Image:
    pixels = image.numpy_view()
    border = max(1, int(round(max(pixels.shape[:2]) * ratio)))
    padded = np.pad(
        pixels,
        ((border, border), (border, border), (0, 0)),
        mode="edge",
    )
    return mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=np.ascontiguousarray(padded),
    )


def process_chunk(
    detector: vision.HandLandmarker,
    fallback_detector: vision.HandLandmarker | None,
    padding_detector: vision.HandLandmarker,
    padding_ratio: float | None,
    fallback_strategy: str | None,
    padding_strategy: str | None,
    dataset_root: Path,
    rows: list[dict[str, str]],
    output_path: Path,
    key: str,
    progress_prefix: str,
) -> None:
    features = np.zeros((len(rows), FEATURE_SIZE), dtype=np.float32)
    usable = np.zeros(len(rows), dtype=np.bool_)
    detected_hands = np.zeros(len(rows), dtype=np.uint8)
    handedness = np.zeros((len(rows), 2), dtype=np.float32)
    handedness_scores = np.zeros((len(rows), 2), dtype=np.float32)
    reasons: list[str] = []
    strategies: list[str] = []

    for index, row in enumerate(rows):
        image_path = dataset_root / row["path"]
        try:
            image = mp.Image.create_from_file(str(image_path))
            full_candidate = detect_landmarks(detector, image)
            selected_candidate = full_candidate
            strategy = "full_frame"
            expected_hands = int(row["expected_hands"])

            if fallback_detector is not None and not full_candidate[0]:
                fallback_candidate = detect_landmarks(fallback_detector, image)
                if fallback_candidate[0]:
                    selected_candidate = fallback_candidate
                    strategy = fallback_strategy or "threshold_fallback"

            if padding_ratio is not None and not selected_candidate[0]:
                padded_candidate = detect_landmarks(
                    padding_detector, pad_image(image, padding_ratio)
                )
                if padded_candidate[0]:
                    selected_candidate = padded_candidate
                    strategy = padding_strategy or "padding_fallback"

            if row["source"] == "multimodal_bisindo_v2":
                crop = xml_crop(
                    image.numpy_view(),
                    image_path,
                    RECOVERY_POLICY["multimodal_xml_crop_margin"],
                )
                if crop is not None:
                    crop_pixels, left, top = crop
                    crop_image = mp.Image(
                        image_format=mp.ImageFormat.SRGB,
                        data=crop_pixels,
                    )
                    crop_candidate = detect_landmarks(detector, crop_image, left, top)
                    full_count = len(full_candidate[0])
                    crop_count = len(crop_candidate[0])
                    if crop_count >= expected_hands or (
                        full_count < expected_hands and crop_count > full_count
                    ):
                        selected_candidate = crop_candidate
                        strategy = "xml_crop"

            hand_landmarks, hand_labels, hand_scores = selected_candidate
            feature = build_feature(
                hand_landmarks,
                hand_labels,
                hand_scores,
                expected_hands,
            )
            features[index] = feature.features
            usable[index] = feature.usable
            detected_hands[index] = feature.detected_hands
            handedness[index] = feature.handedness
            handedness_scores[index] = feature.handedness_scores
            reasons.append(feature.reason)
            strategies.append(strategy)
        except Exception as error:
            reasons.append(f"processing_error:{type(error).__name__}")
            strategies.append("error")
        if (index + 1) % 250 == 0 or index + 1 == len(rows):
            print(f"{progress_prefix}: {index + 1}/{len(rows)}")

    temp_path = output_path.with_suffix(".tmp.npz")
    np.savez_compressed(
        temp_path,
        chunk_key=np.asarray(key),
        feature_version=np.asarray(FEATURE_VERSION),
        sample_ids=np.asarray([row["sample_id"] for row in rows]),
        features=features,
        usable=usable,
        reasons=np.asarray(reasons),
        detected_hands=detected_hands,
        handedness=handedness,
        handedness_scores=handedness_scores,
        strategies=np.asarray(strategies),
    )
    temp_path.replace(output_path)


def coverage_summary(
    rows: list[dict[str, str]],
    usable: np.ndarray,
    reasons: np.ndarray,
    strategies: np.ndarray,
) -> dict[str, Any]:
    def grouped(field: str) -> dict[str, dict[str, int | float]]:
        totals: Counter[str] = Counter()
        accepted: Counter[str] = Counter()
        for row, is_usable in zip(rows, usable, strict=True):
            key = row[field]
            totals[key] += 1
            accepted[key] += int(is_usable)
        return {
            key: {
                "total": totals[key],
                "usable": accepted[key],
                "coverage": round(accepted[key] / totals[key], 6),
            }
            for key in sorted(totals)
        }

    split_label_totals: dict[str, Counter[str]] = defaultdict(Counter)
    split_label_usable: dict[str, Counter[str]] = defaultdict(Counter)
    for row, is_usable in zip(rows, usable, strict=True):
        split_label_totals[row["split"]][row["label"]] += 1
        split_label_usable[row["split"]][row["label"]] += int(is_usable)

    split_label = {}
    for split, totals in sorted(split_label_totals.items()):
        split_label[split] = {
            label: {
                "total": totals[label],
                "usable": split_label_usable[split][label],
                "coverage": round(split_label_usable[split][label] / totals[label], 6),
            }
            for label in sorted(totals)
        }

    reason_counts = Counter(str(reason) for reason in reasons)
    strategy_counts = Counter(str(strategy) for strategy in strategies)
    return {
        "sample_count": len(rows),
        "usable_count": int(usable.sum()),
        "coverage": round(float(usable.mean()), 6),
        "reason_counts": dict(sorted(reason_counts.items())),
        "strategy_counts": dict(sorted(strategy_counts.items())),
        "complete_detection_count": reason_counts.get("ok", 0),
        "partial_detection_count": reason_counts.get("partial_hands", 0),
        "hard_negative_count": reason_counts.get("hard_negative", 0),
        "by_split": grouped("split"),
        "by_source": grouped("source"),
        "by_label": grouped("label"),
        "by_original_label": grouped("original_label"),
        "by_split_label": split_label,
    }


def consolidate(
    mode: str,
    rows: list[dict[str, str]],
    chunk_paths: list[Path],
    expected_keys: list[str],
    output_root: Path,
    generation_key: str,
    manifest_sha256: str,
    model_sha256: str,
    detector_profile: dict[str, Any],
) -> None:
    arrays: dict[str, list[np.ndarray]] = defaultdict(list)
    for path, key in zip(chunk_paths, expected_keys, strict=True):
        with np.load(path, allow_pickle=False) as data:
            if str(data["chunk_key"].item()) != key:
                raise ValueError(f"Stale chunk: {path}")
            for name in (
                "sample_ids",
                "features",
                "usable",
                "reasons",
                "detected_hands",
                "handedness",
                "handedness_scores",
                "strategies",
            ):
                arrays[name].append(data[name])

    combined = {name: np.concatenate(parts, axis=0) for name, parts in arrays.items()}
    if combined["features"].shape != (len(rows), FEATURE_SIZE):
        raise ValueError(
            f"Consolidated shape mismatch: {combined['features'].shape}, rows={len(rows)}"
        )

    final_path = output_root / f"{mode}-static.npz"
    temp_path = final_path.with_suffix(".tmp.npz")
    np.savez_compressed(
        temp_path,
        feature_version=np.asarray(FEATURE_VERSION),
        generation_key=np.asarray(generation_key),
        manifest_sha256=np.asarray(manifest_sha256),
        model_sha256=np.asarray(model_sha256),
        **combined,
    )
    temp_path.replace(final_path)

    index_path = output_root / f"{mode}-landmarks.csv"
    temp_index = index_path.with_suffix(".tmp.csv")
    index_fields = list(rows[0]) + [
        "feature_row",
        "usable",
        "landmark_reason",
        "detected_hands",
        "handedness_0",
        "handedness_1",
        "handedness_score_0",
        "handedness_score_1",
        "detection_strategy",
    ]
    with temp_index.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=index_fields)
        writer.writeheader()
        for index, row in enumerate(rows):
            output_row = dict(row)
            output_row.update(
                {
                    "feature_row": index,
                    "usable": int(combined["usable"][index]),
                    "landmark_reason": str(combined["reasons"][index]),
                    "detected_hands": int(combined["detected_hands"][index]),
                    "handedness_0": float(combined["handedness"][index, 0]),
                    "handedness_1": float(combined["handedness"][index, 1]),
                    "handedness_score_0": float(combined["handedness_scores"][index, 0]),
                    "handedness_score_1": float(combined["handedness_scores"][index, 1]),
                    "detection_strategy": str(combined["strategies"][index]),
                }
            )
            writer.writerow(output_row)
    temp_index.replace(index_path)

    summary = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode.upper(),
        "feature_version": FEATURE_VERSION,
        "feature_count": FEATURE_SIZE,
        "generation_key": generation_key,
        "manifest_sha256": manifest_sha256,
        "model_sha256": model_sha256,
        "detector_profile": detector_profile,
        "recovery_policy": RECOVERY_POLICY,
        **coverage_summary(
            rows,
            combined["usable"],
            combined["reasons"],
            combined["strategies"],
        ),
    }
    summary_path = output_root / f"{mode}-landmark-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {final_path}")
    print(f"Wrote {index_path}")
    print(f"Wrote {summary_path}")


def extract_mode(
    mode: str,
    project_root: Path,
    model_path: Path,
    chunk_size: int,
    max_chunks: int | None,
    force: bool,
) -> None:
    dataset_root = project_root / "dataset"
    manifest_path = dataset_root / "manifests" / f"{mode}-static.csv"
    rows = load_manifest(manifest_path)
    output_root = dataset_root / "processed" / "landmarks"
    chunk_root = output_root / "chunks" / mode
    chunk_root.mkdir(parents=True, exist_ok=True)
    manifest_sha256 = sha256_file(manifest_path)
    model_sha256 = sha256_file(model_path)
    detector_profile = DETECTOR_PROFILES[mode]
    generation_key = artifact_generation_key(
        FEATURE_VERSION,
        FEATURE_SIZE,
        manifest_sha256,
        model_sha256,
        detector_profile,
        RECOVERY_POLICY,
    )
    try:
        model_reference = model_path.relative_to(project_root).as_posix()
    except ValueError:
        model_reference = str(model_path)
    state_path = output_root / f"{mode}-extraction-state.json"
    state = {
        "schema_version": 1,
        "status": "in_progress",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "mode": mode.upper(),
        "feature_version": FEATURE_VERSION,
        "feature_count": FEATURE_SIZE,
        "generation_key": generation_key,
        "manifest_path": manifest_path.relative_to(project_root).as_posix(),
        "manifest_sha256": manifest_sha256,
        "model_path": model_reference,
        "model_sha256": model_sha256,
        "detector_profile": detector_profile,
        "recovery_policy": RECOVERY_POLICY,
    }
    write_json_atomic(state_path, state)

    chunks = [rows[index : index + chunk_size] for index in range(0, len(rows), chunk_size)]
    chunk_paths = [chunk_root / f"chunk-{index:05d}.npz" for index in range(len(chunks))]
    keys = [
        chunk_key(chunk, generation_key, index)
        for index, chunk in enumerate(chunks)
    ]
    processed_now = 0
    with ExitStack() as stack:
        detector = stack.enter_context(
            vision.HandLandmarker.create_from_options(
                vision.HandLandmarkerOptions(
                    base_options=python.BaseOptions(model_asset_path=str(model_path)),
                    running_mode=vision.RunningMode.IMAGE,
                    **detector_profile["primary"],
                )
            )
        )
        fallback_detector = None
        if detector_profile["fallback"] is not None:
            fallback_detector = stack.enter_context(
                vision.HandLandmarker.create_from_options(
                    vision.HandLandmarkerOptions(
                        base_options=python.BaseOptions(model_asset_path=str(model_path)),
                        running_mode=vision.RunningMode.IMAGE,
                        **detector_profile["fallback"],
                    )
                )
            )
        padding_detector = (
            fallback_detector
            if detector_profile["padding_fallback"] is not None
            and detector_profile["padding_fallback"]["detector"] == "fallback"
            else detector
        )
        if padding_detector is None:
            raise ValueError(f"{mode} padding fallback requires a fallback detector")
        fallback_strategy = None
        if detector_profile["fallback"] is not None:
            fallback_strategy = "threshold_fallback_" + profile_tag(
                detector_profile["fallback"]["min_hand_detection_confidence"]
            )
        padding_strategy = None
        if detector_profile["padding_fallback"] is not None:
            padding_confidence = (
                detector_profile["fallback"]["min_hand_detection_confidence"]
                if detector_profile["padding_fallback"]["detector"] == "fallback"
                else detector_profile["primary"]["min_hand_detection_confidence"]
            )
            padding_strategy = (
                "padding_fallback_"
                + profile_tag(detector_profile["padding_fallback"]["ratio"])
                + "_"
                + profile_tag(padding_confidence)
            )
        for index, (chunk, path, key) in enumerate(zip(chunks, chunk_paths, keys, strict=True)):
            if not force and valid_chunk(path, key, len(chunk)):
                continue
            if max_chunks is not None and processed_now >= max_chunks:
                break
            print(f"Processing {mode} chunk {index + 1}/{len(chunks)}...")
            process_chunk(
                detector,
                fallback_detector,
                padding_detector,
                detector_profile["padding_fallback"]["ratio"]
                if detector_profile["padding_fallback"] is not None
                else None,
                fallback_strategy,
                padding_strategy,
                dataset_root,
                chunk,
                path,
                key,
                f"{mode} chunk {index + 1}",
            )
            processed_now += 1

    complete = all(
        valid_chunk(path, key, len(chunk))
        for path, key, chunk in zip(chunk_paths, keys, chunks, strict=True)
    )
    if complete:
        consolidate(
            mode,
            rows,
            chunk_paths,
            keys,
            output_root,
            generation_key,
            manifest_sha256,
            model_sha256,
            detector_profile,
        )

        schema = {
            "schema_version": 1,
            "feature_version": FEATURE_VERSION,
            "feature_count": FEATURE_SIZE,
            "feature_names": feature_names(),
            "hand_slot_policy": {
                "one_hand": "largest wrist-to-middle-MCP hand in slot 0",
                "two_hands": "leftmost wrist in slot 0 and rightmost wrist in slot 1",
                "partial_two_hand": "single detected hand in slot 0 with slot 1 presence zero",
            },
            "normalization": "pixel coordinates, per-hand wrist origin, wrist-to-middle-MCP scale",
            "handedness_feature_policy": "excluded because MediaPipe assumes mirrored input",
            "model_path": model_reference,
            "model_sha256": model_sha256,
            "detector_profiles": DETECTOR_PROFILES,
            "recovery_policy": RECOVERY_POLICY,
        }
        write_json_atomic(output_root / "feature-schema.json", schema)
        write_json_atomic(
            state_path,
            {
                **state,
                "status": "complete",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    else:
        completed = sum(
            valid_chunk(path, key, len(chunk))
            for path, key, chunk in zip(chunk_paths, keys, chunks, strict=True)
        )
        print(f"{mode}: {completed}/{len(chunks)} chunks complete; rerun to resume.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract MediaPipe landmark features.")
    parser.add_argument("--mode", choices=("bisindo", "asl", "all"), default="all")
    parser.add_argument("--chunk-size", type=int, default=1000)
    parser.add_argument("--max-chunks", type=int)
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--model",
        type=Path,
        default=Path("models/mediapipe/hand_landmarker.task"),
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    model_path = args.model if args.model.is_absolute() else project_root / args.model
    if not model_path.is_file():
        raise FileNotFoundError(f"MediaPipe model not found: {model_path}")
    modes = ("bisindo", "asl") if args.mode == "all" else (args.mode,)
    for mode in modes:
        extract_mode(
            mode,
            project_root,
            model_path,
            args.chunk_size,
            args.max_chunks,
            args.force,
        )


if __name__ == "__main__":
    main()
