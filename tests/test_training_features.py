import unittest

import numpy as np

from scripts.train_landmark_mlp import (
    candidate_rows,
    complete_rows,
    mirror_features,
    threshold_predictions,
)


class TrainingFeatureTests(unittest.TestCase):
    def test_two_hand_mirror_swaps_slots_and_relative_direction(self):
        features = np.zeros((1, 132), dtype=np.float64)
        features[0, 0:3] = [1.0, 2.0, 3.0]
        features[0, 63:66] = [4.0, 5.0, 6.0]
        features[0, 126:132] = [1.0, 1.0, 7.0, 8.0, 9.0, 10.0]

        mirrored = mirror_features(features)

        np.testing.assert_array_equal(mirrored[0, 0:3], [-4.0, 5.0, 6.0])
        np.testing.assert_array_equal(mirrored[0, 63:66], [-1.0, 2.0, 3.0])
        np.testing.assert_array_equal(
            mirrored[0, 126:132], [1.0, 1.0, 7.0, -8.0, 9.0, -10.0]
        )

    def test_one_hand_mirror_does_not_move_slot(self):
        features = np.zeros((1, 132), dtype=np.float64)
        features[0, 0:3] = [1.0, 2.0, 3.0]
        features[0, 126] = 1.0

        mirrored = mirror_features(features)

        np.testing.assert_array_equal(mirrored[0, 0:3], [-1.0, 2.0, 3.0])
        self.assertEqual(mirrored[0, 127], 0.0)

    def test_hard_negatives_are_complete_training_rows(self):
        reasons = np.asarray(["ok", "hard_negative", "partial_hands", "no_hands_expected"])
        np.testing.assert_array_equal(complete_rows(reasons), [True, True, False, False])

    def test_primary_only_candidate_excludes_fallback_recoveries(self):
        reasons = np.asarray(["ok", "ok", "ok", "hard_negative"])
        strategies = np.asarray(
            [
                "full_frame",
                "threshold_fallback_020",
                "padding_fallback_025_035",
                "full_frame",
            ]
        )

        np.testing.assert_array_equal(
            candidate_rows("primary_only", reasons, strategies),
            [True, False, False, True],
        )

    def test_threshold_routing_keeps_global_unknown_argmax(self):
        features = np.zeros((1, 132), dtype=np.float64)
        features[0, 126] = 1.0

        predictions = threshold_predictions(
            np.asarray([[0.49, 0.51]]),
            np.asarray(["A", "UNKNOWN"]),
            0.48,
            features,
            {"A": 1, "UNKNOWN": 0},
        )

        np.testing.assert_array_equal(predictions, ["UNKNOWN"])

    def test_threshold_routing_rejects_extra_hands(self):
        features = np.zeros((1, 132), dtype=np.float64)
        features[0, 126:128] = 1.0

        predictions = threshold_predictions(
            np.asarray([[0.9, 0.1]]),
            np.asarray(["A", "UNKNOWN"]),
            0.5,
            features,
            {"A": 1, "UNKNOWN": 0},
        )

        np.testing.assert_array_equal(predictions, ["UNKNOWN"])


if __name__ == "__main__":
    unittest.main()
