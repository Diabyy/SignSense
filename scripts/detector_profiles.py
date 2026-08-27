from __future__ import annotations


DETECTOR_PROFILES = {
    "bisindo": {
        "primary": {
            "num_hands": 2,
            "min_hand_detection_confidence": 0.35,
            "min_hand_presence_confidence": 0.35,
            "min_tracking_confidence": 0.5,
        },
        "fallback": None,
        "padding_fallback": None,
    },
    "asl": {
        "primary": {
            "num_hands": 2,
            "min_hand_detection_confidence": 0.35,
            "min_hand_presence_confidence": 0.35,
            "min_tracking_confidence": 0.5,
        },
        "fallback": {
            "num_hands": 2,
            "min_hand_detection_confidence": 0.20,
            "min_hand_presence_confidence": 0.20,
            "min_tracking_confidence": 0.5,
        },
        "padding_fallback": {
            "ratio": 0.50,
            "detector": "fallback",
        },
    },
}

RECOVERY_POLICY = {
    "multimodal_xml_crop_margin": 1.0,
    "prefer_crop_when_expected_hands_detected": True,
    "retain_partial_two_hand_features": True,
}

INFERENCE_POLICY = "global_argmax_threshold_exact_hands_v1"
