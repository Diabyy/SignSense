# SignSense

SignSense adalah prototype akademik pengenalan alfabet statis BISINDO dan ASL dari webcam. Inferensi landmark dan classifier berjalan di browser. Proyek ini bukan penerjemah bahasa isyarat, alat aksesibilitas tersertifikasi, atau pengganti instruktur/penutur bahasa isyarat.

Demo sementara: https://signsense-delta.vercel.app

## Status

- BISINDO: 23 pose statis; `J`, `R`, dan `Z` ditunda karena membutuhkan gerakan.
- ASL: 24 pose statis; `J` dan `Z` ditunda karena membutuhkan gerakan.
- Kedua model masih eksperimental dan belum memiliki validasi signer-independent multi-user.
- Frame kamera tidak disimpan atau dikirim oleh aplikasi.
- MediaPipe Tasks dapat menghasilkan telemetry penggunaan teknis; deployment SignSense memasang Content Security Policy untuk memblokir koneksi non-origin.

Lihat model card dan batasan rinci di [`Website/docs`](Website/docs/).

## Menjalankan Website

Persyaratan:

- Node.js 24+
- npm 11+
- Desktop Chrome atau Edge dengan kamera

```powershell
cd Website
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

Buka `http://localhost:5173` dan tekan **Aktifkan kamera** hanya saat ingin memulai pengenalan.

## Pipeline Python

Pipeline dataset memerlukan Python 3.12 dan dependency di `requirements.txt`.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m unittest discover -s tests
```

Tahapan utama tersedia sebagai script terpisah:

```text
audit_datasets.py
  -> build_manifests.py
  -> audit_manifest_similarity.py
  -> benchmark_detection_strategies.py
  -> extract_landmarks.py
  -> train_landmark_mlp.py
  -> build_reference_assets.py
```

Raw dataset dan landmark hasil ekstraksi tidak disimpan di repository karena ukuran, privasi, dan reproduksibilitas. Versi, DOI, checksum arsip, serta aturan split tersimpan di `dataset/manifests/`.

## Struktur

```text
dataset/manifests/    metadata sumber, manifest, split, dan audit
dataset/licenses/     catatan lisensi dataset
models/               model browser dan laporan evaluasi
scripts/              pipeline audit, extraction, training, dan aset
tests/                test Python
Website/              aplikasi React/Vite dan test frontend
```

## Deployment

Repository dirancang untuk di-deploy ke Vercel menggunakan `vercel.json`. Vercel menjalankan test frontend, typecheck, dan production build dari direktori `Website/` sebelum menerbitkan `Website/dist`.

## Data dan Lisensi

Kode asli SignSense tidak diberi lisensi publik secara menyeluruh melalui repository ini. Komponen dan dataset pihak ketiga tetap berada di bawah lisensi masing-masing. Lihat [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) dan halaman **Tentang** pada aplikasi.

Khusus ASL Alphabet, sumber mencantumkan `GPL-2.0-only`. Reference images adalah crop turunan dan model ASL dilatih dari dataset tersebut. Status hukum trained model sebagai derivative artifact dapat berbeda menurut yurisdiksi dan belum diputuskan oleh proyek ini.

## Academic Use

Repository dan deployment ini disiapkan untuk demonstrasi dan penilaian. Hasil prediksi dapat salah, termasuk ketika confidence model terlihat tinggi. Jangan menggunakannya untuk keputusan penting atau klaim kefasihan bahasa isyarat.
