from __future__ import annotations

import argparse
import csv
import json
import os
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


def difference_hash(path: Path) -> int:
    with Image.open(path) as image:
        resized = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
        pixels = list(resized.get_flattened_data())
    value = 0
    for row in range(8):
        offset = row * 9
        for column in range(8):
            value = (value << 1) | int(
                pixels[offset + column] > pixels[offset + column + 1]
            )
    return value


class HashTree:
    def __init__(self, value: int, rows: list[dict[str, str]]):
        self.value = value
        self.rows = rows
        self.children: dict[int, HashTree] = {}

    def insert(self, value: int, row: dict[str, str]) -> None:
        node = self
        while True:
            distance = (node.value ^ value).bit_count()
            if distance == 0:
                node.rows.append(row)
                return
            child = node.children.get(distance)
            if child is None:
                node.children[distance] = HashTree(value, [row])
                return
            node = child

    def query(self, value: int, maximum_distance: int) -> list[tuple[int, list[dict[str, str]]]]:
        matches = []
        pending = [self]
        while pending:
            node = pending.pop()
            distance = (node.value ^ value).bit_count()
            if distance <= maximum_distance:
                matches.append((distance, node.rows))
            lower = distance - maximum_distance
            upper = distance + maximum_distance
            pending.extend(
                child
                for edge, child in node.children.items()
                if lower <= edge <= upper
            )
        return matches


def later_split_near_duplicate_ids(
    rows: list[dict[str, str]],
    dataset_root: Path,
    maximum_distance: int,
    workers: int,
) -> set[str]:
    def inspect(row: dict[str, str]) -> tuple[dict[str, str], int]:
        return row, difference_hash(dataset_root / row["path"])

    with ThreadPoolExecutor(max_workers=workers) as executor:
        hashed = list(executor.map(inspect, rows))

    grouped: dict[tuple[str, str], list[tuple[dict[str, str], int]]] = defaultdict(list)
    for row, value in hashed:
        grouped[(row["original_label"], row["split"])].append((row, value))

    duplicate_ids = set()
    labels = sorted({label for label, _ in grouped})
    for label in labels:
        tree: HashTree | None = None
        for split in ("train", "val", "test"):
            accepted = []
            for row, value in sorted(
                grouped.get((label, split), []), key=lambda item: item[0]["sample_id"]
            ):
                if tree is not None and tree.query(value, maximum_distance):
                    duplicate_ids.add(row["sample_id"])
                else:
                    accepted.append((row, value))
            for row, value in accepted:
                if tree is None:
                    tree = HashTree(value, [row])
                else:
                    tree.insert(value, row)
    return duplicate_ids


def audit_similarity(
    rows: list[dict[str, str]],
    dataset_root: Path,
    maximum_distance: int,
    workers: int,
) -> dict[str, Any]:
    def inspect(row: dict[str, str]) -> tuple[dict[str, str], int]:
        return row, difference_hash(dataset_root / row["path"])

    with ThreadPoolExecutor(max_workers=workers) as executor:
        hashed = list(executor.map(inspect, rows))

    grouped: dict[tuple[str, str], list[tuple[dict[str, str], int]]] = defaultdict(list)
    for row, value in hashed:
        grouped[(row["original_label"], row["split"])].append((row, value))

    split_pairs = (("train", "val"), ("train", "test"), ("val", "test"))
    pair_counts = {f"{left}_vs_{right}": 0 for left, right in split_pairs}
    examples = []
    labels = sorted({label for label, _ in grouped})
    for label in labels:
        for left, right in split_pairs:
            left_rows = grouped.get((label, left), [])
            right_rows = grouped.get((label, right), [])
            if not left_rows or not right_rows:
                continue
            first_row, first_hash = left_rows[0]
            tree = HashTree(first_hash, [first_row])
            for row, value in left_rows[1:]:
                tree.insert(value, row)
            pair_name = f"{left}_vs_{right}"
            for right_row, right_hash in right_rows:
                for distance, matching_rows in tree.query(right_hash, maximum_distance):
                    pair_counts[pair_name] += len(matching_rows)
                    if len(examples) < 50:
                        for left_row in matching_rows[: 50 - len(examples)]:
                            examples.append(
                                {
                                    "label": label,
                                    "split_pair": pair_name,
                                    "hamming_distance": distance,
                                    "left_sample_id": left_row["sample_id"],
                                    "left_path": left_row["path"],
                                    "right_sample_id": right_row["sample_id"],
                                    "right_path": right_row["path"],
                                }
                            )

    return {
        "sample_count": len(rows),
        "hash": "64-bit difference hash",
        "maximum_hamming_distance": maximum_distance,
        "cross_split_pair_counts": pair_counts,
        "examples": examples,
        "examples_truncated": sum(pair_counts.values()) > len(examples),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit perceptual similarity across manifest splits.")
    parser.add_argument("--mode", choices=("bisindo", "asl"), default="asl")
    parser.add_argument("--distance", type=int, default=2)
    parser.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 4))
    args = parser.parse_args()
    if not 0 <= args.distance <= 8:
        raise ValueError("--distance must be between 0 and 8")

    project_root = Path(__file__).resolve().parents[1]
    dataset_root = project_root / "dataset"
    manifest_path = dataset_root / "manifests" / f"{args.mode}-static.csv"
    with manifest_path.open("r", encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    result = audit_similarity(rows, dataset_root, args.distance, args.workers)
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": args.mode.upper(),
        **result,
    }
    output_path = dataset_root / "manifests" / f"{args.mode}-similarity-audit.json"
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output_path}")
    print(f"Cross-split perceptual pairs: {sum(result['cross_split_pair_counts'].values())}")


if __name__ == "__main__":
    main()
