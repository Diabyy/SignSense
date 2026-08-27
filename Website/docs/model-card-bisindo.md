# Model Card: BISINDO Static Experimental

## Status

- Model: `landmark-mlp.json`
- Feature schema: `hand-pose-v2`
- Feature count: 132
- Deployment status: experimental
- Inference location: browser only
- External multi-user validation: not available

## Intended Use

Model ini ditujukan untuk prototype pengenalan alfabet BISINDO statis dari webcam. Model bukan penerjemah resmi, alat aksesibilitas tersertifikasi, atau pengganti instruktur BISINDO.

## Outputs

Pose statis: `A B C D E F G H I K L M N O P Q S T U V W X Y`

Output tambahan: `UNKNOWN`

Huruf dinamis yang ditunda: `J R Z`

## Pipeline

1. MediaPipe Hand Landmarker mendeteksi maksimal dua tangan.
2. Landmark dipindahkan ke koordinat pixel untuk menghindari distorsi aspect ratio.
3. Setiap tangan dinormalisasi dengan wrist sebagai origin dan jarak wrist ke middle MCP sebagai skala.
4. Dua tangan diurutkan berdasarkan posisi wrist kiri-ke-kanan.
5. MLP menghasilkan probabilitas kelas.
6. Browser menerapkan hand-count route, confidence threshold, dan temporal smoothing.

## Data

- Multimodal BISINDO Corpus v2
- BISINDO UM v1
- BINUS Hand Sign sebagai source holdout

Split dibuat berdasarkan group dan exact hash untuk mengurangi leakage. Validasi tetap memiliki risiko sequence/signer leakage karena metadata recording sumber tidak lengkap.

## Offline Evaluation

- Landmark coverage: 92.83%
- End-to-end holdout macro-F1: 0.8446
- End-to-end holdout accuracy: 85.93%
- Holdout UNKNOWN false acceptance: 16.67%
- Complete-hand validation macro-F1: 0.9396

Metrik lengkap tersedia di `../../models/bisindo/training-report.json` dan `../../dataset/processed/landmarks/bisindo-landmark-summary.json`.

## Known Weak Classes

- `Q` sering berdekatan dengan `P/D`.
- `X` sering berdekatan dengan `A/B`.
- `U/I` dapat bertabrakan dengan endpoint dinamis `J`.
- `Y` rentan terhadap overlap dan partial hand detection.

## Distribution Warning

Sebelum model turunan didistribusikan publik, kewajiban lisensi dataset, termasuk sumber berlisensi GPL, harus ditinjau kembali.
