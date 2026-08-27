import unittest

import numpy as np

from scripts.landmark_features import FEATURE_SIZE, build_feature, feature_names


def sample_hand(offset_x: float = 0.0, offset_y: float = 0.0, scale: float = 1.0):
    points = np.zeros((21, 3), dtype=np.float32)
    for index in range(21):
        points[index] = [
            offset_x + scale * (index % 5) * 0.1,
            offset_y + scale * (index // 5) * 0.12,
            scale * index * 0.01,
        ]
    points[9] = [offset_x + scale, offset_y, 0.0]
    return points


class LandmarkFeatureTests(unittest.TestCase):
    def test_feature_schema_size(self):
        self.assertEqual(len(feature_names()), FEATURE_SIZE)
        self.assertEqual(FEATURE_SIZE, 132)

    def test_one_hand_uses_slot_zero(self):
        result = build_feature([sample_hand()], ["Left"], [0.9], expected_hands=1)
        self.assertTrue(result.usable)
        self.assertEqual(result.features.shape, (FEATURE_SIZE,))
        self.assertEqual(result.features[126], 1.0)
        self.assertEqual(result.features[127], 0.0)

    def test_normalization_is_translation_and_scale_invariant(self):
        first = build_feature([sample_hand()], ["Right"], [0.9], expected_hands=1)
        transformed = build_feature(
            [sample_hand(offset_x=4.0, offset_y=-2.0, scale=3.5)],
            ["Right"],
            [0.9],
            expected_hands=1,
        )
        np.testing.assert_allclose(first.features[:63], transformed.features[:63], atol=1e-6)

    def test_two_hands_are_ordered_left_to_right(self):
        left = sample_hand(offset_x=0.8)
        right = sample_hand(offset_x=0.2)
        result = build_feature(
            [left, right], ["Left", "Right"], [0.8, 0.9], expected_hands=2
        )
        self.assertTrue(result.usable)
        np.testing.assert_array_equal(result.handedness, [1.0, -1.0])
        np.testing.assert_array_equal(result.features[126:128], [1.0, 1.0])

    def test_two_hand_sign_retains_partial_detection(self):
        result = build_feature([sample_hand()], ["Right"], [0.9], expected_hands=2)
        self.assertTrue(result.usable)
        self.assertEqual(result.reason, "partial_hands")
        np.testing.assert_array_equal(result.features[126:128], [1.0, 0.0])

    def test_no_detection_is_not_usable(self):
        result = build_feature([], [], [], expected_hands=1)
        self.assertFalse(result.usable)
        self.assertEqual(result.reason, "no_hands_detected")

    def test_expected_zero_hands_without_detection_is_not_usable(self):
        result = build_feature([], [], [], expected_hands=0)
        self.assertFalse(result.usable)
        self.assertEqual(result.reason, "no_hands_expected")

    def test_false_detection_for_zero_hand_sample_is_a_hard_negative(self):
        result = build_feature([sample_hand()], ["Right"], [0.9], expected_hands=0)
        self.assertTrue(result.usable)
        self.assertEqual(result.reason, "hard_negative")
        np.testing.assert_array_equal(result.features[126:128], [1.0, 0.0])


if __name__ == "__main__":
    unittest.main()
