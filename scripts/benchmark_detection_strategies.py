from __future__ import annotations

import argparse
import csv
import json
import os
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

os.environ.setdefault("GLOG_minloglevel", "2")

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


LOW_COVERAGE_LABELS = {
    "bisindo": {"G", "M", "N", "Y"},
    "asl": {"A", "C", "M", "N", "P", "X", "nothing"},
}


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def select_rows(
    rows: list[dict[str, str]], mode: str, split: str
) -> list[dict[str, str]]:
    cells: dict[tuple[str, str, str], list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        if row["split"] != split:
            continue
        source_label = row.get("original_label") or row["label"]
        cells[(row["source"], source_label, row["landmark_reason"])].append(row)

    selected = []
    for (_, label, reason), cell_rows in sorted(cells.items()):
        if reason == "ok":
            limit = 5
        elif label in LOW_COVERAGE_LABELS[mode]:
            limit = 40
        else:
            limit = 10
        selected.extend(sorted(cell_rows, key=lambda row: row["sample_id"])[:limit])
    return sorted(selected, key=lambda row: row["sample_id"])


def load_rgb(path: Path) -> np.ndarray:
    encoded = np.fromfile(path, dtype=np.uint8)
    bgr = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"Could not decode {path}")
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def xml_crop(image: np.ndarray, image_path: Path, margin: float) -> np.ndarray | None:
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
    return image[top:bottom, left:right]


def pad_image(image: np.ndarray, ratio: float) -> np.ndarray:
    border = max(1, int(round(max(image.shape[:2]) * ratio)))
    return cv2.copyMakeBorder(
        image,
        border,
        border,
        border,
        border,
        cv2.BORDER_REPLICATE,
    )


def create_detector(model_path: Path, threshold: float) -> vision.HandLandmarker:
    options = vision.HandLandmarkerOptions(
        base_options=python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=threshold,
        min_hand_presence_confidence=threshold,
        min_tracking_confidence=0.5,
    )
    return vision.HandLandmarker.create_from_options(options)


def evaluate_strategy(
    rows: list[dict[str, Any]],
    dataset_root: Path,
    model_path: Path,
    name: str,
    threshold: float,
    crop_margin: float | None,
    padding_ratio: float | None,
) -> None:
    started = time.monotonic()
    with create_detector(model_path, threshold) as detector:
        for index, row in enumerate(rows):
            image_path = dataset_root / row["path"]
            image = load_rgb(image_path)
            if crop_margin is not None:
                image = xml_crop(image, image_path, crop_margin)
                if image is None:
                    row[name] = None
                    continue
            if padding_ratio is not None:
                image = pad_image(image, padding_ratio)
            media_image = mp.Image(
                image_format=mp.ImageFormat.SRGB,
                data=np.ascontiguousarray(image),
            )
            row[name] = len(detector.detect(media_image).hand_landmarks)
            if (index + 1) % 250 == 0:
                print(f"{name}: {index + 1}/{len(rows)}")
    print(f"{name}: finished in {time.monotonic() - started:.1f}s")


def summarize(rows: list[dict[str, Any]], strategy: str) -> dict[str, Any]:
    evaluated = [row for row in rows if row[strategy] is not None]
    baseline_failed = [
        row for row in evaluated if row["baseline_hands"] < row["expected_hands_int"]
    ]
    baseline_passed = [
        row for row in evaluated if row["baseline_hands"] >= row["expected_hands_int"]
    ]
    zero_hand = [row for row in evaluated if row["expected_hands_int"] == 0]
    recovered = [row for row in baseline_failed if row[strategy] >= row["expected_hands_int"]]
    regressed = [row for row in baseline_passed if row[strategy] < row["expected_hands_int"]]

    def recovery_group(field: str) -> dict[str, dict[str, int | float]]:
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in baseline_failed:
            groups[str(row[field])].append(row)
        return {
            key: {
                "baseline_failures": len(group_rows),
                "recovered": sum(
                    row[strategy] >= row["expected_hands_int"] for row in group_rows
                ),
                "recovery_rate": round(
                    sum(row[strategy] >= row["expected_hands_int"] for row in group_rows)
                    / len(group_rows),
                    6,
                ),
            }
            for key, group_rows in sorted(groups.items())
        }

    return {
        "evaluated": len(evaluated),
        "requirement_met": sum(
            row[strategy] >= row["expected_hands_int"] for row in evaluated
        ),
        "baseline_failures": len(baseline_failed),
        "recovered": len(recovered),
        "recovery_rate": round(len(recovered) / len(baseline_failed), 6)
        if baseline_failed
        else 0.0,
        "baseline_passes": len(baseline_passed),
        "regressed": len(regressed),
        "regression_rate": round(len(regressed) / len(baseline_passed), 6)
        if baseline_passed
        else 0.0,
        "zero_hand_samples": len(zero_hand),
        "zero_hand_false_detections": sum(row[strategy] > 0 for row in zero_hand),
        "zero_hand_false_detection_rate": round(
            sum(row[strategy] > 0 for row in zero_hand) / len(zero_hand), 6
        )
        if zero_hand
        else None,
        "recovery_by_source": recovery_group("source"),
        "recovery_by_label": recovery_group("label"),
        "recovery_by_original_label": recovery_group("original_label"),
        "recovery_by_reason": recovery_group("landmark_reason"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark Hand Landmarker recovery strategies.")
    parser.add_argument(
        "--model",
        type=Path,
        default=Path("models/mediapipe/hand_landmarker.task"),
    )
    parser.add_argument("--mode", choices=("bisindo", "asl"), default="bisindo")
    parser.add_argument(
        "--split",
        choices=("train", "val", "test"),
        default="val",
        help="Manifest split to benchmark. Use validation for strategy selection.",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    dataset_root = project_root / "dataset"
    model_path = args.model if args.model.is_absolute() else project_root / args.model
    rows = select_rows(
        load_rows(dataset_root / "processed" / "landmarks" / f"{args.mode}-landmarks.csv"),
        args.mode,
        args.split,
    )
    benchmark_rows: list[dict[str, Any]] = []
    for row in rows:
        benchmark_row: dict[str, Any] = dict(row)
        benchmark_row["expected_hands_int"] = int(row["expected_hands"])
        benchmark_row["baseline_hands"] = int(row["detected_hands"])
        benchmark_rows.append(benchmark_row)

    full_frame_strategies = (
        ("full_threshold_035", 0.35, None, None),
        ("full_threshold_020", 0.20, None, None),
        ("full_threshold_010", 0.10, None, None),
    )
    crop_strategies = (
        ("xml_crop_margin_075_threshold_050", 0.50, 0.75, None),
        ("xml_crop_margin_100_threshold_035", 0.35, 1.00, None),
        ("xml_crop_margin_150_threshold_035", 0.35, 1.50, None),
    )
    padding_strategies = (
        ("pad_025_threshold_035", 0.35, None, 0.25),
        ("pad_050_threshold_035", 0.35, None, 0.50),
        ("pad_025_threshold_020", 0.20, None, 0.25),
        ("pad_050_threshold_020", 0.20, None, 0.50),
    )
    strategies = (
        full_frame_strategies + crop_strategies
        if args.mode == "bisindo"
        else full_frame_strategies + padding_strategies
    )
    print(f"Selected {len(benchmark_rows)} stratified samples")
    for name, threshold, crop_margin, padding_ratio in strategies:
        evaluate_strategy(
            benchmark_rows,
            dataset_root,
            model_path,
            name,
            threshold,
            crop_margin,
            padding_ratio,
        )

    output = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "selection": {
            "split": args.split,
            "sample_count": len(benchmark_rows),
            "failed_per_source_label_reason": (
                f"40 for {sorted(LOW_COVERAGE_LABELS[args.mode])}, 10 for other labels"
            ),
            "successful_per_source_label": 5,
        },
        "strategies": {
            name: {
                "threshold": threshold,
                "crop_margin": crop_margin,
                "padding_ratio": padding_ratio,
                **summarize(benchmark_rows, name),
            }
            for name, threshold, crop_margin, padding_ratio in strategies
        },
        "samples": [
            {
                "sample_id": row["sample_id"],
                "source": row["source"],
                "label": row["label"],
                "path": row["path"],
                "expected_hands": row["expected_hands_int"],
                "baseline_hands": row["baseline_hands"],
                **{name: row[name] for name, _, _, _ in strategies},
            }
            for row in benchmark_rows
        ],
    }
    filename = (
        "detection-strategy-benchmark.json"
        if args.mode == "bisindo"
        else f"{args.mode}-detection-strategy-benchmark.json"
    )
    output_path = dataset_root / "processed" / "landmarks" / filename
    output_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
