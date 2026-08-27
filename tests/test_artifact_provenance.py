import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from scripts.artifact_provenance import artifact_generation_key, sha256_file
from scripts.detector_profiles import DETECTOR_PROFILES, RECOVERY_POLICY
from scripts.train_landmark_mlp import FEATURE_COUNT, FEATURE_VERSION, validate_landmark_artifacts


class ArtifactProvenanceTests(unittest.TestCase):
    def test_trainer_rejects_artifact_after_manifest_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            project_root = Path(directory)
            manifest_root = project_root / "dataset" / "manifests"
            landmark_root = project_root / "dataset" / "processed" / "landmarks"
            model_root = project_root / "models" / "mediapipe"
            manifest_root.mkdir(parents=True)
            landmark_root.mkdir(parents=True)
            model_root.mkdir(parents=True)

            manifest_path = manifest_root / "asl-static.csv"
            model_path = model_root / "hand_landmarker.task"
            manifest_path.write_text("sample_id\nfirst\n", encoding="utf-8")
            model_path.write_bytes(b"detector")
            manifest_sha256 = sha256_file(manifest_path)
            model_sha256 = sha256_file(model_path)
            generation_key = artifact_generation_key(
                FEATURE_VERSION,
                FEATURE_COUNT,
                manifest_sha256,
                model_sha256,
                DETECTOR_PROFILES["asl"],
                RECOVERY_POLICY,
            )
            state = {
                "status": "complete",
                "feature_version": FEATURE_VERSION,
                "feature_count": FEATURE_COUNT,
                "generation_key": generation_key,
                "model_path": "models/mediapipe/hand_landmarker.task",
            }
            (landmark_root / "asl-extraction-state.json").write_text(
                json.dumps(state), encoding="utf-8"
            )
            (landmark_root / "asl-landmark-summary.json").write_text(
                json.dumps({"generation_key": generation_key}), encoding="utf-8"
            )
            artifact_path = landmark_root / "asl-static.npz"
            np.savez_compressed(
                artifact_path,
                generation_key=np.asarray(generation_key),
                manifest_sha256=np.asarray(manifest_sha256),
                model_sha256=np.asarray(model_sha256),
                feature_version=np.asarray(FEATURE_VERSION),
            )

            with np.load(artifact_path, allow_pickle=False) as data:
                provenance = validate_landmark_artifacts(
                    project_root, landmark_root, "asl", data
                )
            self.assertEqual(provenance["generation_key"], generation_key)

            manifest_path.write_text("sample_id\nsecond\n", encoding="utf-8")
            with np.load(artifact_path, allow_pickle=False) as data:
                with self.assertRaisesRegex(ValueError, "stale"):
                    validate_landmark_artifacts(project_root, landmark_root, "asl", data)


if __name__ == "__main__":
    unittest.main()
