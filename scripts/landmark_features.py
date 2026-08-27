from __future__ import annotations

from dataclasses import dataclass

import numpy as np


FEATURE_VERSION = "hand-pose-v2"
NUM_HAND_SLOTS = 2
NUM_LANDMARKS = 21
LANDMARK_DIMS = 3
POSE_FEATURES_PER_HAND = NUM_LANDMARKS * LANDMARK_DIMS
FEATURE_SIZE = POSE_FEATURES_PER_HAND * NUM_HAND_SLOTS + 2 + 4


@dataclass(frozen=True)
class FeatureResult:
    features: np.ndarray
    usable: bool
    reason: str
    detected_hands: int
    handedness: np.ndarray
    handedness_scores: np.ndarray


def feature_names() -> list[str]:
    names = [
        f"hand_{slot}_landmark_{landmark}_{axis}"
        for slot in range(NUM_HAND_SLOTS)
        for landmark in range(NUM_LANDMARKS)
        for axis in ("x", "y", "z")
    ]
    names.extend(["presence_0", "presence_1"])
    names.extend(
        [
            "interhand_wrist_dx",
            "interhand_wrist_dy",
            "interhand_wrist_distance",
            "interhand_log_scale_ratio",
        ]
    )
    if len(names) != FEATURE_SIZE:
        raise AssertionError(f"Expected {FEATURE_SIZE} names, got {len(names)}")
    return names


def handedness_value(label: str) -> float:
    normalized = label.strip().lower()
    if normalized == "right":
        return 1.0
    if normalized == "left":
        return -1.0
    return 0.0


def _normalize_hand(landmarks: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
    points = np.asarray(landmarks, dtype=np.float32)
    if points.shape != (NUM_LANDMARKS, LANDMARK_DIMS):
        raise ValueError(f"Expected landmarks shape (21, 3), got {points.shape}")
    if not np.isfinite(points).all():
        raise ValueError("Landmarks contain non-finite values")

    wrist = points[0].copy()
    scale = float(np.linalg.norm(points[9, :2] - points[0, :2]))
    if not np.isfinite(scale) or scale < 1e-6:
        raise ValueError("Hand scale is zero or non-finite")
    normalized = (points - wrist) / scale
    return normalized.astype(np.float32), wrist, scale


def _ordered_indices(
    landmarks: list[np.ndarray], handedness: list[str], scores: list[float]
) -> list[int]:
    selected = sorted(range(len(landmarks)), key=lambda index: scores[index], reverse=True)[:2]
    if len(selected) < 2:
        return selected
    return sorted(selected, key=lambda index: float(landmarks[index][0, 0]))


def build_feature(
    landmarks: list[np.ndarray],
    handedness: list[str],
    scores: list[float],
    expected_hands: int,
) -> FeatureResult:
    detected_hands = len(landmarks)
    if not (len(handedness) == len(scores) == detected_hands):
        raise ValueError("Landmarks, handedness, and score lengths differ")
    if expected_hands not in (0, 1, 2):
        raise ValueError(f"expected_hands must be 0, 1, or 2, got {expected_hands}")

    empty = np.zeros(FEATURE_SIZE, dtype=np.float32)
    empty_slots = np.zeros(NUM_HAND_SLOTS, dtype=np.float32)
    empty_scores = np.zeros(NUM_HAND_SLOTS, dtype=np.float32)
    if detected_hands == 0:
        reason = "no_hands_expected" if expected_hands == 0 else "no_hands_detected"
        return FeatureResult(empty, False, reason, 0, empty_slots, empty_scores)
    if expected_hands in (0, 1):
        ordered = [
            max(
                range(detected_hands),
                key=lambda index: float(
                    np.linalg.norm(landmarks[index][9, :2] - landmarks[index][0, :2])
                ),
            )
        ]
    else:
        ordered = _ordered_indices(landmarks, handedness, scores)

    normalized_slots = [np.zeros((NUM_LANDMARKS, LANDMARK_DIMS), dtype=np.float32) for _ in range(2)]
    wrists = [np.zeros(3, dtype=np.float32) for _ in range(2)]
    scales = [0.0, 0.0]
    presence = np.zeros(2, dtype=np.float32)
    handedness_slots = np.zeros(2, dtype=np.float32)
    score_slots = np.zeros(2, dtype=np.float32)

    try:
        for slot, source_index in enumerate(ordered):
            normalized, wrist, scale = _normalize_hand(landmarks[source_index])
            normalized_slots[slot] = normalized
            wrists[slot] = wrist
            scales[slot] = scale
            presence[slot] = 1.0
            handedness_slots[slot] = handedness_value(handedness[source_index])
            score_slots[slot] = float(scores[source_index])
    except ValueError as error:
        return FeatureResult(
            empty,
            False,
            f"invalid_geometry:{error}",
            detected_hands,
            empty_slots,
            empty_scores,
        )

    interhand = np.zeros(4, dtype=np.float32)
    if expected_hands == 2 and presence[0] == presence[1] == 1:
        mean_scale = (scales[0] + scales[1]) / 2
        delta = (wrists[1][:2] - wrists[0][:2]) / mean_scale
        interhand[0:2] = delta
        interhand[2] = float(np.linalg.norm(delta))
        interhand[3] = float(np.log(scales[1] / scales[0]))

    features = np.concatenate(
        [
            normalized_slots[0].reshape(-1),
            normalized_slots[1].reshape(-1),
            presence,
            interhand,
        ]
    ).astype(np.float32)
    if features.shape != (FEATURE_SIZE,) or not np.isfinite(features).all():
        return FeatureResult(
            empty,
            False,
            "invalid_feature_vector",
            detected_hands,
            handedness_slots,
            score_slots,
        )
    if expected_hands == 0:
        reason = "hard_negative"
    elif expected_hands == 2 and detected_hands < 2:
        reason = "partial_hands"
    else:
        reason = "ok"
    return FeatureResult(
        features,
        True,
        reason,
        detected_hands,
        handedness_slots,
        score_slots,
    )
