from __future__ import annotations

import csv
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from PIL import Image, ImageDraw, ImageOps


OUTPUT_SIZE = 640
SOURCE_PREFERENCE = {
    "bisindo": ("multimodal_bisindo_v2", "bisindo_um_v1"),
    "asl": ("asl_alphabet_v1",),
}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def expected_hands(mode_spec: dict[str, Any]) -> dict[str, int]:
    routes = {letter: 1 for letter in mode_spec["one_hand_static"]}
    routes.update({letter: 2 for letter in mode_spec["two_hand_static"]})
    routes.update(
        {item["label"]: int(item["expected_hands"]) for item in mode_spec["deferred_letters"]}
    )
    return routes


def confidence_score(row: dict[str, str], hand_count: int) -> float:
    scores = [float(row[f"handedness_score_{index}"]) for index in range(hand_count)]
    return min(scores) if scores else 0.0


def candidate_rows(
    rows: list[dict[str, str]],
    mode: str,
    letter: str,
    form: str,
    hand_count: int,
) -> list[dict[str, str]]:
    sources = SOURCE_PREFERENCE[mode]
    candidates = [
        row
        for row in rows
        if row["split"] == "train"
        and row["original_label"] == letter
        and row["usable"] == "1"
        and row["landmark_reason"] == "ok"
        and int(row["detected_hands"]) >= hand_count
        and (row["label"] == letter if form == "static" else row["label"] == "UNKNOWN")
        and row["source"] in sources
    ]
    source_rank = {source: index for index, source in enumerate(sources)}
    return sorted(
        candidates,
        key=lambda row: (
            source_rank[row["source"]],
            -confidence_score(row, hand_count),
            row["sample_id"],
        ),
    )


def selected_hands(result: Any, expected: int) -> list[Any]:
    hands = list(result.hand_landmarks)
    if len(hands) < expected:
        return []

    def area(hand: Any) -> float:
        xs = [point.x for point in hand]
        ys = [point.y for point in hand]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))

    return sorted(hands, key=area, reverse=True)[:expected]


def crop_box(hands: list[Any], width: int, height: int) -> tuple[int, int, int, int]:
    xs = [point.x * width for hand in hands for point in hand]
    ys = [point.y * height for hand in hands for point in hand]
    left, right = min(xs), max(xs)
    top, bottom = min(ys), max(ys)
    center_x = (left + right) / 2
    center_y = (top + bottom) / 2
    side = max(right - left, bottom - top) * 1.8
    side = max(side, min(width, height) * 0.35)
    side = min(side, width, height)
    crop_left = min(max(center_x - side / 2, 0), width - side)
    crop_top = min(max(center_y - side / 2, 0), height - side)
    return tuple(round(value) for value in (crop_left, crop_top, crop_left + side, crop_top + side))


def create_detector(model_path: Path) -> vision.HandLandmarker:
    return vision.HandLandmarker.create_from_options(
        vision.HandLandmarkerOptions(
            base_options=python.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.IMAGE,
            num_hands=2,
            min_hand_detection_confidence=0.2,
            min_hand_presence_confidence=0.2,
            min_tracking_confidence=0.5,
        )
    )


def render_asset(
    detector: vision.HandLandmarker,
    dataset_root: Path,
    candidates: list[dict[str, str]],
    hand_count: int,
    output_path: Path,
) -> tuple[dict[str, str], tuple[int, int, int, int]]:
    for row in candidates[:100]:
        source_path = dataset_root / row["path"]
        result = detector.detect(mp.Image.create_from_file(str(source_path)))
        hands = selected_hands(result, hand_count)
        if not hands:
            continue
        with Image.open(source_path) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
            box = crop_box(hands, image.width, image.height)
            cropped = image.crop(box).resize(
                (OUTPUT_SIZE, OUTPUT_SIZE), Image.Resampling.LANCZOS
            )
            output_path.parent.mkdir(parents=True, exist_ok=True)
            cropped.save(output_path, "WEBP", quality=88, method=6)
        return row, box
    raise ValueError(f"No detectable reference candidate for {output_path.stem.upper()}")


def create_contact_sheet(
    entries: list[dict[str, Any]], public_root: Path, output_path: Path
) -> None:
    columns = 7
    card_width = 180
    card_height = 215
    rows = (len(entries) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * card_width, rows * card_height), "#0b100f")
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(entries):
        left = (index % columns) * card_width
        top = (index // columns) * card_height
        with Image.open(public_root / entry["assetPath"]) as asset:
            preview = asset.convert("RGB").resize((160, 160), Image.Resampling.LANCZOS)
        sheet.paste(preview, (left + 10, top + 10))
        draw.text((left + 12, top + 178), entry["letter"], fill="#d9ff68")
        draw.text((left + 42, top + 180), entry["form"].upper(), fill="#8f9993")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, "WEBP", quality=85, method=6)


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    dataset_root = project_root / "dataset"
    website_root = project_root / "Website"
    public_root = website_root / "public"
    model_path = project_root / "models" / "mediapipe" / "hand_landmarker.task"
    class_spec = load_json(dataset_root / "manifests" / "class-spec.json")
    source_records = {
        source["id"]: source
        for source in load_json(dataset_root / "manifests" / "sources.json")["sources"]
    }

    catalog: dict[str, Any] = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modes": {},
    }
    asset_manifest: dict[str, Any] = {
        "schemaVersion": 1,
        "generatedAt": catalog["generatedAt"],
        "assets": [],
    }

    with create_detector(model_path) as detector:
        for mode in ("bisindo", "asl"):
            mode_spec = class_spec["modes"][mode]
            static_letters = set(mode_spec["static_letters"])
            routes = expected_hands(mode_spec)
            landmark_rows = load_csv(
                dataset_root / "processed" / "landmarks" / f"{mode}-landmarks.csv"
            )
            entries = []
            for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
                form = "static" if letter in static_letters else "dynamic"
                candidates = candidate_rows(
                    landmark_rows, mode, letter, form, routes[letter]
                )
                if not candidates:
                    raise ValueError(f"No training candidates for {mode}/{letter}")
                asset_path = Path("reference") / mode / f"{letter.lower()}.webp"
                output_path = public_root / asset_path
                selected, box = render_asset(
                    detector,
                    dataset_root,
                    candidates,
                    routes[letter],
                    output_path,
                )
                source = source_records[selected["source"]]
                entry = {
                    "mode": mode,
                    "letter": letter,
                    "form": form,
                    "expectedHands": routes[letter],
                    "modelStatus": "recognized" if form == "static" else "deferred",
                    "reviewStatus": "provisional",
                    "regionStatus": "not-documented",
                    "frameOnly": form == "dynamic",
                    "assetPath": asset_path.as_posix(),
                    "assetSha256": sha256_file(output_path),
                    "sampleId": selected["sample_id"],
                    "originalPath": selected["path"],
                    "originalSha256": selected["content_sha256"],
                    "sourceId": selected["source"],
                    "sourceName": source["name"],
                    "sourceAuthors": source.get("creators", []),
                    "sourceUrl": source.get("page_url") or source.get("repository_url"),
                    "sourceDoi": source.get("doi") or source.get("dataset_doi"),
                    "license": source["license"]["spdx"],
                    "licenseUrl": source["license"].get("url"),
                    "cropBox": list(box),
                    "transformation": "Hand-focused square crop, resized to 640x640 WebP; metadata removed.",
                    "altText": (
                        f"Contoh tangan untuk huruf {letter} dari data training "
                        f"{mode_spec['spec_id'].split('-')[0].upper()}."
                    ),
                }
                entries.append(entry)
                asset_manifest["assets"].append(entry)
                print(f"Selected {mode}/{letter}: {selected['sample_id']} ({selected['source']})")
            catalog["modes"][mode] = entries
            create_contact_sheet(
                entries,
                public_root,
                dataset_root / "processed" / "reference" / f"{mode}-contact-sheet.webp",
            )

    catalog_path = website_root / "src" / "data" / "alphabet.generated.json"
    catalog_path.parent.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    manifest_path = public_root / "reference" / "asset-manifest.json"
    manifest_path.write_text(json.dumps(asset_manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {catalog_path}")
    print(f"Wrote {manifest_path}")


if __name__ == "__main__":
    main()
