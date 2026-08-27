# SignSense Website

Aplikasi React/Vite untuk inferensi alfabet BISINDO dan ASL di browser. Frame kamera diproses di perangkat dan tidak diunggah oleh aplikasi. Frontend ini terpisah dari pipeline dataset dan training di direktori induk.

## Requirements

- Node.js 24+
- npm 11+
- Desktop Chrome untuk baseline live test
- Kamera yang dapat diakses dari `localhost`

## Commands

```powershell
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npm run preview
```

Buka `http://localhost:5173` setelah menjalankan `npm run dev`.

## Local Assets

Build mengambil model canonical tanpa mengubahnya:

- `../models/mediapipe/hand_landmarker.task`
- `../models/bisindo/landmark-mlp.json`
- `../models/asl/landmark-mlp.json`

WASM dari `@mediapipe/tasks-vision` disalin ke `dist/mediapipe/`. Tidak ada CDN atau backend inference. Package tersebut memuat telemetry teknis; deployment Vercel memblokir koneksi non-origin melalui Content Security Policy.

Foto referensi alfabet dibuat dari sampel training canonical dan disimpan sebagai WebP tanpa metadata. Untuk menyeleksi ulang sampel, crop tangan, serta memperbarui catalog dan provenance manifest:

```powershell
python ..\scripts\build_reference_assets.py
```

Script memakai environment Python project karena memerlukan MediaPipe dan Pillow. Hasilnya berada di `public/reference/`, `src/data/alphabet.generated.json`, dan `../dataset/processed/reference/` untuk contact sheet review.

## Routes

- `#/` landing page
- `#/belajar` galeri alfabet BISINDO/ASL
- `#/belajar/:mode/:letter` detail huruf dan provenance
- `#/kamera/:mode` recognizer yang dimuat secara lazy
- `#/panduan` panduan penggunaan dan privasi
- `#/tentang` sumber data, lisensi, dan batasan

## Inference Flow

```text
Camera -> mode-specific detector profile -> 132 features -> selected MLP
       -> global argmax -> confidence/exact-hand gate -> temporal smoothing -> UI
```

Saat dua tangan terlihat, aplikasi mengevaluasi hipotesis satu-tangan dan dua-tangan. Setiap hipotesis memakai global argmax yang sama dengan evaluator Python, lalu confidence dan exact-hand gate diterapkan. Mode ASL memakai fallback detector stateless dan padded frame hanya setelah detector utama gagal.

## Project Structure

```text
src/components/       shell, kartu referensi, dan UI kamera
src/data/             catalog alfabet dan provenance generated
src/hooks/            lifecycle kamera dan inference loop
src/lib/features.ts   parity fitur hand-pose-v2
src/lib/mlp.ts        scaler dan MLP forward pass
src/lib/mediapipe.ts  loader lokal dan landmark overlay
src/lib/smoothing.ts  stabilisasi dan transcript latch
src/pages/            landing, belajar, detail, panduan, tentang, kamera
tests/                routing, catalog, asset, parity, dan smoothing tests
docs/                 model card, privasi, batasan, dan live-test protocol
```

## Status

Mode BISINDO dan ASL sama-sama eksperimental serta memakai model, metadata kelas, dan lifecycle detector yang terpisah. BISINDO menyediakan 23 pose statis; ASL menyediakan 24. Keduanya belum production-ready atau tervalidasi multi-user.
