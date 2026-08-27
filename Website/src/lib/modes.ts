import aslModelUrl from "../../../models/asl/landmark-mlp.json?url";
import bisindoModelUrl from "../../../models/bisindo/landmark-mlp.json?url";
import type { SerializedDetectorProfile } from "./mlp";

export type SignMode = "bisindo" | "asl";

export interface DetectorConfig {
  primaryConfidence: number;
  fallbackConfidence?: number;
  paddingRatio?: number;
  paddingConfidence?: number;
}

export interface SignModeConfig {
  id: SignMode;
  label: string;
  modelMode: "BISINDO" | "ASL";
  modelUrl: string;
  staticLetters: readonly string[];
  dynamicLetters: readonly string[];
  detector: DetectorConfig;
  modelInferencePolicy?: string;
  modelDetectorProfile?: SerializedDetectorProfile;
  description: string;
  warning: string;
  deferredCopy: string;
}

export const MODE_CONFIGS: Record<SignMode, SignModeConfig> = {
  bisindo: {
    id: "bisindo",
    label: "BISINDO",
    modelMode: "BISINDO",
    modelUrl: bisindoModelUrl,
    staticLetters: [
      "A", "B", "C", "D", "E", "F", "G", "H", "I", "K", "L", "M", "N", "O", "P", "Q",
      "S", "T", "U", "V", "W", "X", "Y",
    ],
    dynamicLetters: ["J", "R", "Z"],
    detector: { primaryConfidence: 0.35 },
    description:
      "Pengenalan alfabet BISINDO berbasis landmark. Model masih eksperimental dan dapat keliru, khususnya pada pose regional atau tangan yang saling menutup.",
    warning:
      "Q/U/X/Y serta cluster D/P/Q, A/B/X dan I/U/J masih memiliki risiko salah klasifikasi lintas sumber.",
    deferredCopy: "J, R, dan Z membutuhkan gerakan sehingga belum menjadi output model statis.",
  },
  asl: {
    id: "asl",
    label: "ASL",
    modelMode: "ASL",
    modelUrl: aslModelUrl,
    staticLetters: [
      "A", "B", "C", "D", "E", "F", "G", "H", "I", "K", "L", "M", "N", "O", "P", "Q",
      "R", "S", "T", "U", "V", "W", "X", "Y",
    ],
    dynamicLetters: ["J", "Z"],
    detector: {
      primaryConfidence: 0.35,
      fallbackConfidence: 0.2,
      paddingRatio: 0.5,
      paddingConfidence: 0.2,
    },
    modelInferencePolicy: "global_argmax_threshold_exact_hands_v1",
    modelDetectorProfile: {
      primary: {
        num_hands: 2,
        min_hand_detection_confidence: 0.35,
        min_hand_presence_confidence: 0.35,
        min_tracking_confidence: 0.5,
      },
      fallback: {
        num_hands: 2,
        min_hand_detection_confidence: 0.2,
        min_hand_presence_confidence: 0.2,
        min_tracking_confidence: 0.5,
      },
      padding_fallback: { ratio: 0.5, detector: "fallback" },
    },
    description:
      "Pengenalan alfabet ASL statis berbasis landmark. Classifier telah diuji secara internal, tetapi detector masih sensitif terhadap kepalan dan tangan yang terlalu dekat kamera.",
    warning:
      "Pose A dan N paling rentan tidak terdeteksi. Jaga wrist terlihat, beri jarak dari kamera, dan anggap hasil sebagai eksperimen, bukan terjemahan resmi.",
    deferredCopy: "J dan Z membutuhkan lintasan gerak sehingga belum menjadi output model statis.",
  },
};
