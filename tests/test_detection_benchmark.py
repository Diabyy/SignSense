import unittest

from scripts.benchmark_detection_strategies import select_rows


class DetectionBenchmarkTests(unittest.TestCase):
    def test_selection_does_not_cross_manifest_splits(self):
        rows = [
            {
                "sample_id": "train-a",
                "source": "source",
                "original_label": "A",
                "label": "A",
                "landmark_reason": "ok",
                "split": "train",
            },
            {
                "sample_id": "val-a",
                "source": "source",
                "original_label": "A",
                "label": "A",
                "landmark_reason": "ok",
                "split": "val",
            },
            {
                "sample_id": "test-a",
                "source": "source",
                "original_label": "A",
                "label": "A",
                "landmark_reason": "ok",
                "split": "test",
            },
        ]

        selected = select_rows(rows, "asl", "val")

        self.assertEqual([row["sample_id"] for row in selected], ["val-a"])


if __name__ == "__main__":
    unittest.main()
