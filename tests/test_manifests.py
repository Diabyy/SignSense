import unittest

from scripts.build_manifests import (
    asl_sequence_group_id,
    asl_sequence_split,
    asl_unknown_expected_hands,
)


class ManifestTests(unittest.TestCase):
    def test_asl_sequence_split_uses_contiguous_ranges_and_guard_bands(self):
        self.assertEqual(asl_sequence_split(1), "train")
        self.assertEqual(asl_sequence_split(2000), "train")
        self.assertIsNone(asl_sequence_split(2001))
        self.assertIsNone(asl_sequence_split(2100))
        self.assertEqual(asl_sequence_split(2101), "val")
        self.assertEqual(asl_sequence_split(2500), "val")
        self.assertIsNone(asl_sequence_split(2501))
        self.assertEqual(asl_sequence_split(2601), "test")
        self.assertEqual(asl_sequence_split(3000), "test")

    def test_asl_sequence_groups_are_shared_across_labels(self):
        self.assertEqual(asl_sequence_group_id(1), "asl_alphabet_v1:sequence:000")
        self.assertEqual(asl_sequence_group_id(50), "asl_alphabet_v1:sequence:000")
        self.assertEqual(asl_sequence_group_id(51), "asl_alphabet_v1:sequence:001")

    def test_asl_nothing_is_zero_hand_unknown(self):
        hand_counts = {"J": 1, "Z": 1}

        self.assertEqual(asl_unknown_expected_hands("nothing", hand_counts), 0)
        self.assertEqual(asl_unknown_expected_hands("J", hand_counts), 1)
        self.assertEqual(asl_unknown_expected_hands("del", hand_counts), 1)


if __name__ == "__main__":
    unittest.main()
