# Model Card: ASL Static Experimental

## Status

- Model: `models/asl/landmark-mlp.json`
- Feature schema: `hand-pose-v2`
- Feature count: 132
- Confidence threshold: 0.78
- Selected training candidate: strict
- Inference policy: `global_argmax_threshold_exact_hands_v1`
- Deployment status: experimental
- External signer-independent validation: not available

## Intended Use

Model ini adalah prototype pengenalan alfabet ASL statis dari webcam. Model bukan penerjemah resmi, alat aksesibilitas tersertifikasi, atau pengganti instruktur ASL.

## Outputs

Pose statis: `A B C D E F G H I K L M N O P Q R S T U V W X Y`

Output tambahan: `UNKNOWN`

Huruf dinamis yang ditunda: `J Z`

## Detector Profile

1. Full-frame Hand Landmarker pada threshold 0,35 dalam mode `VIDEO` di browser.
2. Full-frame fallback pada threshold 0,20 dalam mode stateless `IMAGE` jika detector utama gagal.
3. Padded-frame 50% pada threshold 0,20 dalam mode stateless `IMAGE` jika kedua full-frame detector gagal.

Profile fallback dipilih hanya dari validation split. Semua tahap berjalan lokal. Padded-frame hanya dibuat di memori dan tidak disimpan.

## Data

- Manifest ASL: 70.146 sampel.
- Train: 50.000.
- Validation: 10.058.
- Sequence-held-out test: 10.088.
- `J`, `Z`, `del`, `space`, dan `nothing` dipetakan ke `UNKNOWN` sesuai kebijakan manifest.
- Bundled test images sumber dikeluarkan karena merupakan exact duplicate dari training bundle.

Split memakai rentang sequence kontigu: `1-2000` train, `2101-2500` validation, dan `2601-3000` test. Dua guard band 100 frame dikeluarkan. Sebanyak 54 validation/test frame tambahan dikeluarkan karena near-duplicate dengan split lebih awal pada audit 64-bit difference hash dengan jarak Hamming maksimal 2. Audit akhir mencatat nol pasangan lintas split pada ambang tersebut.

Metadata signer/session tidak tersedia. Test ini mengukur sequence-held-out internal generalization dan tidak membuktikan signer-independent generalization. Detector dan threshold dikunci dari validation sebelum test dievaluasi.

## Internal Evaluation

Landmark coverage keseluruhan:

- Usable: 62.473 / 70.146.
- Coverage: 89,06%.
- Validation coverage: 95,77%.
- Test coverage: 48,97%.

Classifier pada 4.940 test frame yang memiliki landmark:

- Macro-F1: 0,8117.
- Accuracy: 80,91%.
- UNKNOWN false acceptance: 16,07%.

End-to-end sequence-held-out test, dengan detector miss menjadi `UNKNOWN`:

- Macro-F1: 0,5161.
- Accuracy: 43,47%.
- UNKNOWN false acceptance: 3,60%.

Metrik lengkap tersedia di `../../models/asl/training-report.json`, `../../dataset/processed/landmarks/asl-landmark-summary.json`, dan `../../dataset/manifests/asl-similarity-audit.json`.

## Main Limitations

Test sequence menunjukkan distribution shift detector yang besar. Classifier tidak dapat memulihkan frame yang tidak menghasilkan landmark, sehingga performa end-to-end jauh di bawah usable-frame classifier.

Tidak ada classifier hard-negative dari gambar `nothing` pada ekstraksi terakhir karena detector tidak menghasilkan false hand pada sampel tersebut. UNKNOWN classifier terutama berasal dari pose tangan kontrol/dinamis dan belum mewakili background, wajah, lengan, transisi, atau tangan acak dari webcam. FAR dunia nyata belum tervalidasi.

## Reproducibility

- Landmark generation key: `bc2039da893cabbccc6f5e692f7b748c62b2c91aae68ca8231379ac08c95db0b`.
- Trainer menolak extraction state, summary, atau NPZ yang tidak lengkap maupun stale.
- Model browser memuat inference policy dan detector profile yang divalidasi terhadap konfigurasi mode ASL.

## Distribution Warning

Dataset ASL sumber tercatat GPL-2.0-only. Kewajiban distribusi model turunan harus ditinjau sebelum artifact dipublikasikan.
