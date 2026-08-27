from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_generation_key(
    feature_version: str,
    feature_count: int,
    manifest_sha256: str,
    model_sha256: str,
    detector_profile: dict[str, Any],
    recovery_policy: dict[str, Any],
) -> str:
    payload = {
        "feature_version": feature_version,
        "feature_count": feature_count,
        "manifest_sha256": manifest_sha256,
        "model_sha256": model_sha256,
        "detector_profile": detector_profile,
        "recovery_policy": recovery_policy,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temp_path.replace(path)
