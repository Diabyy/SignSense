from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    from audit_manifest_similarity import later_split_near_duplicate_ids
except ModuleNotFoundError:
    from scripts.audit_manifest_similarity import later_split_near_duplicate_ids


MANIFEST_FIELDS = [
    "sample_id",
    "path",
    "language",
    "source",
    "source_partition",
    "original_label",
    "label",
    "is_unknown",
    "expected_hands",
    "group_id",
    "split",
    "content_sha256",
    "file_bytes",
]

EXCLUSION_FIELDS = [
    "path",
    "language",
    "source",
    "source_partition",
    "original_label",
    "reason",
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_digest(*parts: str) -> str:
    return hashlib.sha256(":".join(parts).encode("utf-8")).hexdigest()


def assign_group_splits(
    group_sizes: dict[str, int], ratios: list[tuple[str, float]], seed: str
) -> dict[str, str]:
    if not group_sizes:
        return {}
    ratio_total = sum(ratio for _, ratio in ratios)
    if abs(ratio_total - 1.0) > 1e-9:
        raise ValueError(f"Split ratios must total 1, got {ratio_total}")

    ordered = sorted(group_sizes, key=lambda group: stable_digest(seed, group))
    total_samples = sum(group_sizes.values())
    boundaries = []
    cumulative = 0.0
    for split, ratio in ratios:
        cumulative += ratio
        boundaries.append((split, cumulative))

    result: dict[str, str] = {}
    consumed = 0
    for group in ordered:
        midpoint = (consumed + group_sizes[group] / 2) / total_samples
        selected = boundaries[-1][0]
        for split, boundary in boundaries:
            if midpoint < boundary:
                selected = split
                break
        result[group] = selected
        consumed += group_sizes[group]
    return result


def load_class_spec(dataset_root: Path) -> dict[str, Any]:
    path = dataset_root / "manifests" / "class-spec.json"
    return json.loads(path.read_text(encoding="utf-8"))


def expected_hands_map(mode_spec: dict[str, Any]) -> dict[str, int]:
    result = {label: 1 for label in mode_spec["one_hand_static"]}
    result.update({label: 2 for label in mode_spec["two_hand_static"]})
    result.update(
        {item["label"]: item["expected_hands"] for item in mode_spec["deferred_letters"]}
    )
    return result


def multimodal_base(stem: str) -> str:
    stem = re.sub(r"_jpg\.rf\.[0-9a-f]+$", "", stem, flags=re.IGNORECASE)
    return re.sub(r"_2$", "", stem).lower()


def um_base(stem: str) -> str:
    return re.sub(r"_(?:2|3|AR)$", "", stem, flags=re.IGNORECASE).lower()


def make_row(
    *,
    dataset_root: Path,
    path: Path,
    language: str,
    source: str,
    source_partition: str,
    original_label: str,
    label: str,
    expected_hands: int,
    group_id: str,
    split: str,
    content_sha256: str | None = None,
) -> dict[str, str | int]:
    relative_path = path.relative_to(dataset_root).as_posix()
    digest = content_sha256 or sha256_file(path)
    sample_id = stable_digest(source, relative_path)[:20]
    return {
        "sample_id": sample_id,
        "path": relative_path,
        "language": language,
        "source": source,
        "source_partition": source_partition,
        "original_label": original_label,
        "label": label,
        "is_unknown": int(label == "UNKNOWN"),
        "expected_hands": expected_hands,
        "group_id": group_id,
        "split": split,
        "content_sha256": digest,
        "file_bytes": path.stat().st_size,
    }


def exclusion(
    dataset_root: Path,
    path: Path,
    language: str,
    source: str,
    source_partition: str,
    original_label: str,
    reason: str,
) -> dict[str, str]:
    return {
        "path": path.relative_to(dataset_root).as_posix(),
        "language": language,
        "source": source,
        "source_partition": source_partition,
        "original_label": original_label,
        "reason": reason,
    }


def validate_multimodal_annotation(image_path: Path, label: str) -> str | None:
    xml_path = image_path.with_suffix(".xml")
    if not xml_path.is_file():
        return "missing_matching_xml"
    try:
        annotation = ET.parse(xml_path).getroot()
    except Exception:
        return "invalid_xml"
    object_labels = [
        (obj.findtext("name") or "").strip() for obj in annotation.findall("object")
    ]
    if len(object_labels) != 1:
        return "multi_object_annotation"
    if object_labels[0] != label:
        return "annotation_label_mismatch"
    return None


def build_bisindo(
    dataset_root: Path, mode_spec: dict[str, Any], seed: str
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    static_letters = set(mode_spec["static_letters"])
    deferred_letters = {item["label"] for item in mode_spec["deferred_letters"]}
    hand_counts = expected_hands_map(mode_spec)
    rows: list[dict[str, Any]] = []
    exclusions: list[dict[str, str]] = []

    multimodal_root = (
        dataset_root
        / "raw/bisindo/alphabet/multimodal-bisindo-v2"
        / "A Multimodal BISINDO Corpus Annotated Images and V"
    )
    multimodal_candidates: list[dict[str, Any]] = []
    for partition in ("Train", "Test"):
        for label_dir in sorted((multimodal_root / partition).iterdir()):
            if not label_dir.is_dir():
                continue
            original_label = label_dir.name.upper()
            if original_label not in static_letters | deferred_letters:
                continue
            for image_path in sorted(label_dir.glob("*.jpg")):
                problem = validate_multimodal_annotation(image_path, original_label)
                if problem:
                    exclusions.append(
                        exclusion(
                            dataset_root,
                            image_path,
                            "BISINDO",
                            "multimodal_bisindo_v2",
                            partition.lower(),
                            original_label,
                            problem,
                        )
                    )
                    continue
                group_id = (
                    f"multimodal_bisindo_v2:{original_label}:"
                    f"{multimodal_base(image_path.stem)}"
                )
                multimodal_candidates.append(
                    {
                        "path": image_path,
                        "partition": partition.lower(),
                        "original_label": original_label,
                        "label": (
                            original_label if original_label in static_letters else "UNKNOWN"
                        ),
                        "expected_hands": hand_counts[original_label],
                        "group_id": group_id,
                    }
                )

    multimodal_by_original: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for candidate in multimodal_candidates:
        multimodal_by_original[candidate["original_label"]].append(candidate)
    multimodal_splits: dict[str, str] = {}
    for original_label, candidates in multimodal_by_original.items():
        group_sizes = Counter(candidate["group_id"] for candidate in candidates)
        multimodal_splits.update(
            assign_group_splits(
                dict(group_sizes),
                [("train", 0.9), ("val", 0.1)],
                f"{seed}:multimodal:{original_label}",
            )
        )
    for candidate in multimodal_candidates:
        rows.append(
            make_row(
                dataset_root=dataset_root,
                path=candidate["path"],
                language="BISINDO",
                source="multimodal_bisindo_v2",
                source_partition=candidate["partition"],
                original_label=candidate["original_label"],
                label=candidate["label"],
                expected_hands=candidate["expected_hands"],
                group_id=candidate["group_id"],
                split=multimodal_splits[candidate["group_id"]],
            )
        )

    um_root = (
        dataset_root
        / "raw/bisindo/alphabet/bisindo-um-v1"
        / "BISINDO DATASET/Mendeley BISINDO"
    )
    um_candidates: list[dict[str, Any]] = []
    for label_dir in sorted(um_root.iterdir()):
        if not label_dir.is_dir():
            continue
        original_label = label_dir.name.upper()
        if original_label not in static_letters | deferred_letters:
            continue
        for image_path in sorted(label_dir.glob("*.jpg")):
            group_id = f"bisindo_um_v1:{original_label}:{um_base(image_path.stem)}"
            um_candidates.append(
                {
                    "path": image_path,
                    "original_label": original_label,
                    "label": original_label if original_label in static_letters else "UNKNOWN",
                    "expected_hands": hand_counts[original_label],
                    "group_id": group_id,
                }
            )
    um_by_original: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for candidate in um_candidates:
        um_by_original[candidate["original_label"]].append(candidate)
    um_splits: dict[str, str] = {}
    for original_label, candidates in um_by_original.items():
        group_sizes = Counter(candidate["group_id"] for candidate in candidates)
        um_splits.update(
            assign_group_splits(
                dict(group_sizes),
                [("train", 0.8), ("val", 0.2)],
                f"{seed}:um:{original_label}",
            )
        )
    for candidate in um_candidates:
        rows.append(
            make_row(
                dataset_root=dataset_root,
                path=candidate["path"],
                language="BISINDO",
                source="bisindo_um_v1",
                source_partition="unsplit",
                original_label=candidate["original_label"],
                label=candidate["label"],
                expected_hands=candidate["expected_hands"],
                group_id=candidate["group_id"],
                split=um_splits[candidate["group_id"]],
            )
        )

    binus_root = dataset_root / "raw/bisindo/alphabet/binus-hand-sign/collectedimages"
    binus_candidates: list[tuple[Path, str, str]] = []
    for label_dir in sorted(binus_root.iterdir()):
        if not label_dir.is_dir():
            continue
        original_label = label_dir.name.upper()
        if original_label not in static_letters | deferred_letters:
            continue
        for image_path in sorted(
            label_dir.glob("*.jpg"), key=lambda path: (" - Copy" in path.name, path.name)
        ):
            binus_candidates.append((image_path, original_label, sha256_file(image_path)))

    seen_hashes: dict[str, Path] = {}
    for image_path, original_label, digest in binus_candidates:
        if digest in seen_hashes:
            exclusions.append(
                exclusion(
                    dataset_root,
                    image_path,
                    "BISINDO",
                    "binus_hand_sign",
                    "collectedimages",
                    original_label,
                    "exact_duplicate",
                )
            )
            continue
        seen_hashes[digest] = image_path
        label = original_label if original_label in static_letters else "UNKNOWN"
        rows.append(
            make_row(
                dataset_root=dataset_root,
                path=image_path,
                language="BISINDO",
                source="binus_hand_sign",
                source_partition="collectedimages",
                original_label=original_label,
                label=label,
                expected_hands=hand_counts[original_label],
                group_id=f"binus_hand_sign:{original_label}:{image_path.stem.lower()}",
                split="test",
                content_sha256=digest,
            )
        )

    return rows, exclusions


def asl_sequence_number(path: Path) -> int:
    match = re.search(r"(\d+)$", path.stem)
    if not match:
        raise ValueError(f"ASL filename has no numeric sequence: {path}")
    return int(match.group(1))


ASL_SEQUENCE_SPLITS = {
    "train": (1, 2000),
    "val": (2101, 2500),
    "test": (2601, 3000),
}
ASL_SEQUENCE_BLOCK_SIZE = 50


def asl_sequence_split(number: int) -> str | None:
    for split, (start, end) in ASL_SEQUENCE_SPLITS.items():
        if start <= number <= end:
            return split
    return None


def asl_sequence_group_id(number: int) -> str:
    block = (number - 1) // ASL_SEQUENCE_BLOCK_SIZE
    return f"asl_alphabet_v1:sequence:{block:03d}"


def asl_unknown_expected_hands(original_label: str, hand_counts: dict[str, int]) -> int:
    if original_label == "nothing":
        return 0
    return hand_counts.get(original_label, 1)


def build_asl(
    dataset_root: Path, mode_spec: dict[str, Any], seed: str
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    static_letters = set(mode_spec["static_letters"])
    deferred_letters = {item["label"] for item in mode_spec["deferred_letters"]}
    unknown_sources = deferred_letters | {"nothing", "del", "space"}
    hand_counts = expected_hands_map(mode_spec)
    root = dataset_root / "raw/asl/alphabet/asl_alphabet_train/asl_alphabet_train"

    rows: list[dict[str, Any]] = []
    exclusions: list[dict[str, str]] = []
    candidates_by_original: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for label_dir in sorted(root.iterdir()):
        if not label_dir.is_dir():
            continue
        original_label = label_dir.name
        normalized_label = original_label.upper() if len(original_label) == 1 else original_label
        if normalized_label not in static_letters and normalized_label not in unknown_sources:
            continue
        for image_path in sorted(label_dir.glob("*.jpg")):
            number = asl_sequence_number(image_path)
            split = asl_sequence_split(number)
            if split is None:
                exclusions.append(
                    exclusion(
                        dataset_root,
                        image_path,
                        "ASL",
                        "asl_alphabet_v1",
                        "train_bundle",
                        normalized_label,
                        "sequence_guard_band",
                    )
                )
                continue
            candidates_by_original[normalized_label].append(
                {
                    "path": image_path,
                    "original_label": normalized_label,
                    "group_id": asl_sequence_group_id(number),
                    "split": split,
                }
            )

    selected_unknown_groups: set[tuple[str, str]] = set()
    unknown_group_targets = {"train": 8, "val": 2, "test": 2}
    for original_label in sorted(unknown_sources):
        candidates = candidates_by_original[original_label]
        groups_by_split: dict[str, set[str]] = defaultdict(set)
        for candidate in candidates:
            groups_by_split[candidate["split"]].add(candidate["group_id"])
        for split, target in unknown_group_targets.items():
            ordered = sorted(
                groups_by_split[split],
                key=lambda group: stable_digest(seed, "asl-unknown", original_label, group),
            )
            if len(ordered) < target:
                raise ValueError(
                    f"Not enough ASL unknown groups for {original_label}/{split}: "
                    f"need {target}, found {len(ordered)}"
                )
            selected_unknown_groups.update(
                (original_label, group_id) for group_id in ordered[:target]
            )

    for original_label, candidates in sorted(candidates_by_original.items()):
        for candidate in candidates:
            split = candidate["split"]
            if original_label in static_letters:
                rows.append(
                    make_row(
                        dataset_root=dataset_root,
                        path=candidate["path"],
                        language="ASL",
                        source="asl_alphabet_v1",
                        source_partition="train_bundle",
                        original_label=original_label,
                        label=original_label,
                        expected_hands=1,
                        group_id=candidate["group_id"],
                        split=split,
                    )
                )
            elif (original_label, candidate["group_id"]) in selected_unknown_groups:
                rows.append(
                    make_row(
                        dataset_root=dataset_root,
                        path=candidate["path"],
                        language="ASL",
                        source="asl_alphabet_v1",
                        source_partition="train_bundle",
                        original_label=original_label,
                        label="UNKNOWN",
                        expected_hands=asl_unknown_expected_hands(original_label, hand_counts),
                        group_id=candidate["group_id"],
                        split=split,
                    )
                )
            else:
                exclusions.append(
                    exclusion(
                        dataset_root,
                        candidate["path"],
                        "ASL",
                        "asl_alphabet_v1",
                        "train_bundle",
                        original_label,
                        "unknown_downsampling",
                    )
                )

    test_root = dataset_root / "raw/asl/alphabet/asl_alphabet_test/asl_alphabet_test"
    for image_path in sorted(test_root.glob("*.jpg")):
        original_label = image_path.stem.removesuffix("_test")
        exclusions.append(
            exclusion(
                dataset_root,
                image_path,
                "ASL",
                "asl_alphabet_v1",
                "test_bundle",
                original_label,
                "exact_duplicate_of_training_image",
            )
        )

    near_duplicate_ids = later_split_near_duplicate_ids(
        rows,
        dataset_root,
        maximum_distance=2,
        workers=min(8, os.cpu_count() or 4),
    )
    if near_duplicate_ids:
        kept_rows = []
        for row in rows:
            if row["sample_id"] not in near_duplicate_ids:
                kept_rows.append(row)
                continue
            exclusions.append(
                exclusion(
                    dataset_root,
                    dataset_root / row["path"],
                    "ASL",
                    row["source"],
                    row["source_partition"],
                    row["original_label"],
                    "perceptual_near_duplicate_of_earlier_split",
                )
            )
        rows = kept_rows

    return rows, exclusions


def validate_manifest(rows: list[dict[str, Any]], output_labels: set[str]) -> None:
    if not rows:
        raise ValueError("Manifest is empty")
    labels = {str(row["label"]) for row in rows}
    if labels != output_labels:
        raise ValueError(f"Label mismatch: expected {output_labels}, got {labels}")

    group_splits: dict[str, set[str]] = defaultdict(set)
    hash_splits: dict[str, set[str]] = defaultdict(set)
    sample_ids = set()
    for row in rows:
        group_splits[str(row["group_id"])].add(str(row["split"]))
        hash_splits[str(row["content_sha256"])].add(str(row["split"]))
        sample_id = str(row["sample_id"])
        if sample_id in sample_ids:
            raise ValueError(f"Duplicate sample_id: {sample_id}")
        sample_ids.add(sample_id)

    leaked_groups = {group: splits for group, splits in group_splits.items() if len(splits) > 1}
    if leaked_groups:
        raise ValueError(f"Group leakage detected: {list(leaked_groups.items())[:5]}")
    leaked_hashes = {digest: splits for digest, splits in hash_splits.items() if len(splits) > 1}
    if leaked_hashes:
        raise ValueError(f"Exact hash leakage detected: {list(leaked_hashes.items())[:5]}")

    for split in sorted({str(row["split"]) for row in rows}):
        split_labels = {str(row["label"]) for row in rows if row["split"] == split}
        if split_labels != output_labels:
            raise ValueError(
                f"Split {split} is missing labels: {sorted(output_labels - split_labels)}"
            )


def validate_asl_sequence_isolation(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        number = asl_sequence_number(Path(str(row["path"])))
        expected_split = asl_sequence_split(number)
        if expected_split != row["split"]:
            raise ValueError(
                f"ASL sequence {number} belongs to {expected_split}, not {row['split']}"
            )
        expected_group = asl_sequence_group_id(number)
        if row["group_id"] != expected_group:
            raise ValueError(
                f"ASL sequence {number} has group {row['group_id']}, expected {expected_group}"
            )


def manifest_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_split = Counter(str(row["split"]) for row in rows)
    by_source = Counter(str(row["source"]) for row in rows)
    by_split_label: dict[str, Counter[str]] = defaultdict(Counter)
    by_split_source: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        by_split_label[str(row["split"])][str(row["label"])] += 1
        by_split_source[str(row["split"])][str(row["source"])] += 1
    return {
        "sample_count": len(rows),
        "split_counts": dict(sorted(by_split.items())),
        "source_counts": dict(sorted(by_source.items())),
        "split_label_counts": {
            split: dict(sorted(counts.items()))
            for split, counts in sorted(by_split_label.items())
        },
        "split_source_counts": {
            split: dict(sorted(counts.items()))
            for split, counts in sorted(by_split_source.items())
        },
    }


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fields: list[str]) -> None:
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with temp_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    temp_path.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build curated SignSense manifests.")
    parser.add_argument("--seed", default="signsense-v1")
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    dataset_root = project_root / "dataset"
    manifests_root = dataset_root / "manifests"
    class_spec = load_class_spec(dataset_root)

    print("Building BISINDO manifest...")
    bisindo_rows, bisindo_exclusions = build_bisindo(
        dataset_root, class_spec["modes"]["bisindo"], args.seed
    )
    print("Building ASL manifest...")
    asl_rows, asl_exclusions = build_asl(
        dataset_root, class_spec["modes"]["asl"], args.seed
    )

    validate_manifest(
        bisindo_rows, set(class_spec["modes"]["bisindo"]["output_labels"])
    )
    validate_manifest(asl_rows, set(class_spec["modes"]["asl"]["output_labels"]))
    validate_asl_sequence_isolation(asl_rows)

    all_exclusions = sorted(
        bisindo_exclusions + asl_exclusions,
        key=lambda row: (row["language"], row["source"], row["path"], row["reason"]),
    )
    bisindo_rows.sort(key=lambda row: (row["split"], row["label"], row["path"]))
    asl_rows.sort(key=lambda row: (row["split"], row["label"], row["path"]))

    write_csv(manifests_root / "bisindo-static.csv", bisindo_rows, MANIFEST_FIELDS)
    write_csv(manifests_root / "asl-static.csv", asl_rows, MANIFEST_FIELDS)
    write_csv(manifests_root / "curation-exclusions.csv", all_exclusions, EXCLUSION_FIELDS)

    summary = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "seed": args.seed,
        "bisindo": manifest_summary(bisindo_rows),
        "asl": manifest_summary(asl_rows),
        "asl_sequence_policy": {
            "split_ranges": {
                split: {"start": bounds[0], "end": bounds[1]}
                for split, bounds in ASL_SEQUENCE_SPLITS.items()
            },
            "group_size": ASL_SEQUENCE_BLOCK_SIZE,
            "guard_ranges": [
                {"start": 2001, "end": 2100},
                {"start": 2501, "end": 2600},
            ],
        },
        "exclusions": {
            "count": len(all_exclusions),
            "reason_counts": dict(
                sorted(Counter(row["reason"] for row in all_exclusions).items())
            ),
        },
        "validation": {
            "group_leakage": 0,
            "exact_hash_leakage": 0,
            "asl_sequence_guard_band": True,
            "all_output_labels_present_in_each_split": True,
        },
    }
    summary_path = manifests_root / "split-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {manifests_root / 'bisindo-static.csv'} ({len(bisindo_rows)} rows)")
    print(f"Wrote {manifests_root / 'asl-static.csv'} ({len(asl_rows)} rows)")
    print(f"Wrote {manifests_root / 'curation-exclusions.csv'} ({len(all_exclusions)} rows)")
    print(f"Wrote {summary_path}")


if __name__ == "__main__":
    main()
