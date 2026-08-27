# Known Limitations

## Product Status

SignSense saat ini adalah prototype penelitian dengan mode **Experimental Full**. Prediksi dapat terlihat sangat yakin tetapi tetap salah ketika pose berbeda dari distribusi training.

## Systematic Confusions

| Cluster | Risiko |
|---|---|
| `D/P/Q` | Pose kontak dan varian regional dapat saling menyerupai. |
| `A/B/X` | Tangan bersilang atau menutup membuat fitur `X` mendekati `A/B`. |
| `I/U/J` | Frame tunggal `J` dinamis dapat identik dengan pose statis `I/U`. |
| `Y` | Tangan pendukung menutup wrist atau jari tangan utama. |

Confidence threshold tidak dapat sepenuhnya memperbaiki high-confidence domain errors tersebut.

## Detector Limits

- Dua tangan yang bertumpuk dapat terdeteksi sebagai satu tangan.
- Tangan edge-on, blur, gelap, atau terlalu kecil dapat tidak terdeteksi.
- Satu tangan dapat sesekali menghasilkan dua detection yang tumpang tindih.
- Tidak ada frame yang dikirim ke fallback server.

Pada mode ASL, detector menjalankan full-frame threshold 0,35, fallback 0,20, lalu padded-frame 50% pada threshold 0,20 jika diperlukan. Recovery ini meningkatkan coverage keseluruhan, tetapi sequence-held-out test coverage hanya 48,97%; detector miss tetap menjadi bottleneck sebelum classifier.

## Linguistic Limits

- BISINDO memiliki variasi regional.
- Spesifikasi kelas masih provisional dan belum diadjudikasi instruktur Tuli/BISINDO.
- `J`, `R`, dan `Z` tidak menjadi output model statis.
- ASL tidak digunakan sebagai pengganti otomatis untuk kelas BISINDO.

Pada ASL, hanya `J` dan `Z` yang ditunda. `R` adalah pose statis ASL dan tidak boleh disamakan dengan kebijakan kelas BISINDO.

## Validation Limits

- Holdout BINUS berukuran kecil.
- Belum ada validasi 3–5 pengguna baru.
- Live test pertama hanya single-user smoke test.
- Hasil internal tidak boleh disebut multi-user validation.
- ASL hanya memiliki sequence-held-out internal test karena metadata signer/session tidak tersedia.
- Audit difference hash menghapus near-duplicate lintas split pada ambang Hamming 2, tetapi tidak menjamin seluruh kemiripan visual atau identitas signer telah terisolasi.
- UNKNOWN belum memiliki hard-negative webcam yang cukup; background, wajah, lengan, transisi, dan pose tangan acak belum tervalidasi.
