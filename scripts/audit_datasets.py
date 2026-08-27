from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


@dataclass(frozen=True)
class Source:
    source_id: str
    collection: str
    relative_root: str
    language: str
    split: str
    label_strategy: str = "parent"
    canonical: bool = True


SOURCES = (
    Source(
        "multimodal_bisindo_train",
        "multimodal_bisindo_v2",
        "raw/bisindo/alphabet/multimodal-bisindo-v2/"
        "A Multimodal BISINDO Corpus Annotated Images and V/Train",
        "BISINDO",
        "train",
    ),
    Source(
        "multimodal_bisindo_test",
        "multimodal_bisindo_v2",
        "raw/bisindo/alphabet/multimodal-bisindo-v2/"
        "A Multimodal BISINDO Corpus Annotated Images and V/Test",
        "BISINDO",
        "test",
    ),
    Source(
        "bisindo_um",
        "bisindo_um_v1",
        "raw/bisindo/alphabet/bisindo-um-v1/BISINDO DATASET/Mendeley BISINDO",
        "BISINDO",
        "unsplit",
    ),
    Source(
        "binus_collected",
        "binus_hand_sign",
        "raw/bisindo/alphabet/binus-hand-sign/collectedimages",
        "BISINDO",
        "unsplit",
    ),
    Source(
        "binus_train",
        "binus_hand_sign",
        "raw/bisindo/alphabet/binus-hand-sign/train",
        "BISINDO",
        "train",
        "dot_prefix",
        False,
    ),
    Source(
        "binus_test",
        "binus_hand_sign",
        "raw/bisindo/alphabet/binus-hand-sign/test",
        "BISINDO",
        "test",
        "dot_prefix",
        False,
    ),
    Source(
        "asl_train",
        "asl_alphabet_v1",
        "raw/asl/alphabet/asl_alphabet_train/asl_alphabet_train",
        "ASL",
        "train",
    ),
    Source(
        "asl_test",
        "asl_alphabet_v1",
        "raw/asl/alphabet/asl_alphabet_test/asl_alphabet_test",
        "ASL",
        "test",
        "underscore_test",
    ),
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def label_for(path: Path, strategy: str) -> str:
    if strategy == "parent":
        return path.parent.name
    if strategy == "dot_prefix":
        return path.name.split(".", 1)[0]
    if strategy == "underscore_test":
        return path.stem.removesuffix("_test")
    raise ValueError(f"Unknown label strategy: {strategy}")


def inspect_image(path: Path, dataset_root: Path, source: Source) -> dict[str, Any]:
    relative_path = path.relative_to(dataset_root).as_posix()
    record: dict[str, Any] = {
        "source_id": source.source_id,
        "collection": source.collection,
        "path": relative_path,
        "label": label_for(path, source.label_strategy),
        "bytes": path.stat().st_size,
    }
    try:
        with Image.open(path) as image:
            record["dimensions"] = f"{image.width}x{image.height}"
            record["mode"] = image.mode
            image.verify()
        record["sha256"] = sha256_file(path)
    except Exception as error:
        record["error"] = f"{type(error).__name__}: {error}"
    return record


def duplicate_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    by_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        if "sha256" in record:
            by_hash[record["sha256"]].append(record)

    groups = [group for group in by_hash.values() if len(group) > 1]
    groups.sort(key=lambda group: (-len(group), group[0]["path"]))
    cross_label_groups = [
        group for group in groups if len({record["label"] for record in group}) > 1
    ]

    examples = []
    for group in groups[:25]:
        examples.append(
            {
                "sha256": group[0]["sha256"],
                "labels": sorted({record["label"] for record in group}),
                "files": [record["path"] for record in group[:20]],
                "omitted_file_count": max(0, len(group) - 20),
            }
        )

    return {
        "group_count": len(groups),
        "files_in_duplicate_groups": sum(len(group) for group in groups),
        "redundant_file_count": sum(len(group) - 1 for group in groups),
        "cross_label_group_count": len(cross_label_groups),
        "examples": examples,
        "examples_truncated": len(groups) > len(examples),
    }


def audit_annotations(
    root: Path,
    dataset_root: Path,
    source: Source,
    files: list[Path],
    image_paths: list[Path],
) -> dict[str, Any] | None:
    xml_paths = [path for path in files if path.suffix.lower() == ".xml"]
    if not xml_paths:
        return None

    def pair_key(path: Path) -> str:
        return path.relative_to(root).with_suffix("").as_posix().lower()

    images_by_key = {pair_key(path): path for path in image_paths}
    xml_by_key = {pair_key(path): path for path in xml_paths}
    image_without_xml = sorted(set(images_by_key) - set(xml_by_key))
    orphan_xml = sorted(set(xml_by_key) - set(images_by_key))

    object_count_distribution: Counter[int] = Counter()
    object_label_counts: Counter[str] = Counter()
    folder_label_absent = []
    additional_labels = []
    invalid_bbox = []
    filename_mismatch = []
    parse_errors = []

    for xml_path in xml_paths:
        relative_path = xml_path.relative_to(dataset_root).as_posix()
        folder_label = label_for(xml_path, source.label_strategy)
        try:
            annotation = ET.parse(xml_path).getroot()
            objects = annotation.findall("object")
            labels = [
                (obj.findtext("name") or "[missing]").strip() for obj in objects
            ]
            object_count_distribution[len(objects)] += 1
            object_label_counts.update(labels)

            if folder_label not in labels:
                folder_label_absent.append(
                    {"path": relative_path, "folder_label": folder_label, "labels": labels}
                )
            extra = sorted(set(labels) - {folder_label})
            if extra:
                additional_labels.append(
                    {
                        "path": relative_path,
                        "folder_label": folder_label,
                        "additional_labels": extra,
                    }
                )

            width = int(annotation.findtext("size/width") or 0)
            height = int(annotation.findtext("size/height") or 0)
            for obj in objects:
                box = obj.find("bndbox")
                if box is None:
                    invalid_bbox.append({"path": relative_path, "reason": "missing"})
                    continue
                xmin = int(box.findtext("xmin") or 0)
                ymin = int(box.findtext("ymin") or 0)
                xmax = int(box.findtext("xmax") or 0)
                ymax = int(box.findtext("ymax") or 0)
                if not (0 <= xmin < xmax <= width and 0 <= ymin < ymax <= height):
                    invalid_bbox.append(
                        {
                            "path": relative_path,
                            "image_size": [width, height],
                            "bbox": [xmin, ymin, xmax, ymax],
                        }
                    )

            image_path = images_by_key.get(pair_key(xml_path))
            declared_filename = annotation.findtext("filename")
            if image_path and declared_filename != image_path.name:
                filename_mismatch.append(
                    {
                        "path": relative_path,
                        "declared": declared_filename,
                        "actual": image_path.name,
                    }
                )
        except Exception as error:
            parse_errors.append(
                {"path": relative_path, "error": f"{type(error).__name__}: {error}"}
            )

    return {
        "xml_count": len(xml_paths),
        "paired_image_count": len(set(images_by_key) & set(xml_by_key)),
        "image_without_xml_count": len(image_without_xml),
        "orphan_xml_count": len(orphan_xml),
        "parse_error_count": len(parse_errors),
        "object_count_distribution": {
            str(key): value for key, value in sorted(object_count_distribution.items())
        },
        "object_label_counts": dict(sorted(object_label_counts.items())),
        "folder_label_absent_count": len(folder_label_absent),
        "xml_with_additional_labels_count": len(additional_labels),
        "invalid_bbox_count": len(invalid_bbox),
        "filename_mismatch_count": len(filename_mismatch),
        "examples": {
            "image_without_xml": image_without_xml[:25],
            "orphan_xml": orphan_xml[:25],
            "parse_errors": parse_errors[:25],
            "folder_label_absent": folder_label_absent[:25],
            "additional_labels": additional_labels[:25],
            "invalid_bbox": invalid_bbox[:25],
            "filename_mismatch": filename_mismatch[:25],
        },
    }


def audit_source(
    dataset_root: Path, source: Source, workers: int
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    root = dataset_root / source.relative_root
    if not root.is_dir():
        raise FileNotFoundError(f"Dataset source is missing: {root}")

    files = sorted(path for path in root.rglob("*") if path.is_file())
    image_paths = [path for path in files if path.suffix.lower() in IMAGE_SUFFIXES]
    extension_counts = Counter(path.suffix.lower() or "[none]" for path in files)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        records = list(
            executor.map(
                lambda path: inspect_image(path, dataset_root, source), image_paths
            )
        )

    valid = [record for record in records if "sha256" in record]
    invalid = [record for record in records if "error" in record]
    summary = {
        "collection": source.collection,
        "language": source.language,
        "split": source.split,
        "canonical": source.canonical,
        "root": source.relative_root,
        "file_count": len(files),
        "total_bytes": sum(path.stat().st_size for path in files),
        "extension_counts": dict(sorted(extension_counts.items())),
        "image_count": len(records),
        "valid_image_count": len(valid),
        "invalid_image_count": len(invalid),
        "invalid_images": [
            {"path": record["path"], "error": record["error"]}
            for record in invalid
        ],
        "class_counts": dict(sorted(Counter(r["label"] for r in valid).items())),
        "dimension_counts": dict(
            sorted(Counter(r["dimensions"] for r in valid).items())
        ),
        "mode_counts": dict(sorted(Counter(r["mode"] for r in valid).items())),
        "duplicates": duplicate_summary(valid),
    }
    annotations = audit_annotations(root, dataset_root, source, files, image_paths)
    if annotations is not None:
        summary["annotations"] = annotations
    return summary, valid


def split_overlap(
    left: list[dict[str, Any]], right: list[dict[str, Any]]
) -> dict[str, Any]:
    left_hashes = {record["sha256"] for record in left}
    right_hashes = {record["sha256"] for record in right}
    overlap = left_hashes & right_hashes
    examples = []
    for digest in sorted(overlap)[:25]:
        examples.append(
            {
                "sha256": digest,
                "left_files": [r["path"] for r in left if r["sha256"] == digest],
                "right_files": [r["path"] for r in right if r["sha256"] == digest],
            }
        )
    return {
        "overlapping_hash_count": len(overlap),
        "left_matching_file_count": sum(r["sha256"] in overlap for r in left),
        "right_matching_file_count": sum(r["sha256"] in overlap for r in right),
        "examples": examples,
        "examples_truncated": len(overlap) > len(examples),
    }


def cross_collection_duplicates(
    records: list[dict[str, Any]], canonical_sources: set[str]
) -> dict[str, Any]:
    by_hash: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        if record["source_id"] in canonical_sources:
            by_hash[record["sha256"]].append(record)

    groups = [
        group
        for group in by_hash.values()
        if len({record["collection"] for record in group}) > 1
    ]
    groups.sort(key=lambda group: (-len(group), group[0]["path"]))
    examples = [
        {
            "sha256": group[0]["sha256"],
            "collections": sorted({record["collection"] for record in group}),
            "labels": sorted({record["label"] for record in group}),
            "files": [record["path"] for record in group[:20]],
            "omitted_file_count": max(0, len(group) - 20),
        }
        for group in groups[:25]
    ]
    return {
        "group_count": len(groups),
        "files_in_duplicate_groups": sum(len(group) for group in groups),
        "examples": examples,
        "examples_truncated": len(groups) > len(examples),
    }


def bisindo_um_filename_groups(records: list[dict[str, Any]]) -> dict[str, Any]:
    groups = Counter(
        re.sub(r"_(?:2|3|AR)$", "", Path(record["path"]).stem)
        for record in records
    )
    size_distribution = Counter(groups.values())
    return {
        "grouping_rule": "remove a terminal _2, _3, or _AR from the filename stem",
        "group_count": len(groups),
        "group_size_distribution": {
            str(size): count for size, count in sorted(size_distribution.items())
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit SignSense source datasets.")
    parser.add_argument(
        "--output",
        type=Path,
        help="Output JSON path. Defaults to dataset/manifests/dataset-audit.json.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=min(8, (os.cpu_count() or 4) + 2),
        help="Number of concurrent image validation workers.",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    dataset_root = project_root / "dataset"
    output = args.output or dataset_root / "manifests" / "dataset-audit.json"

    summaries: dict[str, dict[str, Any]] = {}
    records_by_source: dict[str, list[dict[str, Any]]] = {}
    for source in SOURCES:
        print(f"Auditing {source.source_id}...")
        summary, records = audit_source(dataset_root, source, args.workers)
        summaries[source.source_id] = summary
        records_by_source[source.source_id] = records

    all_records = [
        record for records in records_by_source.values() for record in records
    ]
    canonical_sources = {source.source_id for source in SOURCES if source.canonical}

    binus_collected_hashes = {
        record["sha256"] for record in records_by_source["binus_collected"]
    }
    binus_mirror_records = (
        records_by_source["binus_train"] + records_by_source["binus_test"]
    )
    binus_mirror_hashes = {record["sha256"] for record in binus_mirror_records}
    binus_missing_hashes = binus_collected_hashes - binus_mirror_hashes

    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_root": str(dataset_root),
        "sources": summaries,
        "split_overlap": {
            "multimodal_bisindo_train_vs_test": split_overlap(
                records_by_source["multimodal_bisindo_train"],
                records_by_source["multimodal_bisindo_test"],
            ),
            "binus_train_vs_test": split_overlap(
                records_by_source["binus_train"], records_by_source["binus_test"]
            ),
            "asl_train_vs_test": split_overlap(
                records_by_source["asl_train"], records_by_source["asl_test"]
            ),
        },
        "binus_mirror": {
            "collected_unique_hash_count": len(binus_collected_hashes),
            "train_test_unique_hash_count": len(binus_mirror_hashes),
            "missing_from_train_test_hash_count": len(
                binus_missing_hashes
            ),
            "extra_in_train_test_hash_count": len(
                binus_mirror_hashes - binus_collected_hashes
            ),
            "missing_from_train_test_files": [
                record["path"]
                for record in records_by_source["binus_collected"]
                if record["sha256"] in binus_missing_hashes
            ],
        },
        "derived_groups": {
            "bisindo_um_filename_base": bisindo_um_filename_groups(
                records_by_source["bisindo_um"]
            )
        },
        "cross_collection_duplicates": cross_collection_duplicates(
            all_records, canonical_sources
        ),
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
