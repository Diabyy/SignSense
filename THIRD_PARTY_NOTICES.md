# Third-Party Notices

SignSense adalah prototype akademik. File pihak ketiga dan artifact turunannya tetap mengikuti lisensi sumber masing-masing. Tidak ada bagian dari dokumen ini yang mengubah lisensi asli.

## Multimodal BISINDO Corpus v2

- Judul: *A Multimodal BISINDO Corpus: Annotated Images and Videos for Indonesian Sign Language Hand Gesture Recognition*
- Penulis: Lilis Nur Hayati; Anik Nur Handayani; Wahyu Sakti Gunawan Irianto; Rosa Andrie Asmara; Dolly Indra
- Versi: 2
- DOI: https://doi.org/10.17632/235c78xbmk.2
- Lisensi: CC BY 4.0
- Cakupan di repository: reference images BISINDO yang dipilih dari training split dan kontribusi terhadap model BISINDO
- Perubahan reference images: hand-focused square crop, resize 640x640, konversi WebP, dan penghapusan metadata

## BISINDO DATASET v1

- Judul: *BISINDO DATASET*
- Penulis: Arya Raden; Muhammad Asshafi
- Versi: 1
- DOI: https://doi.org/10.17632/4xnkvr88tk.1
- Lisensi: CC BY 4.0
- Cakupan di repository: kontribusi terhadap model BISINDO

Teks dan ketentuan CC BY 4.0: https://creativecommons.org/licenses/by/4.0/legalcode

## BISINDO Hand-Sign Detection Using Transfer Learning

- Penulis: David Joan; Vincent Vincent; Kevin Jason Daniel; Said Achmad; Rhio Sutoyo
- DOI publikasi: https://doi.org/10.1109/ICRAIE59459.2023.10468194
- Repository sumber: https://github.com/Zappie733/Research-Binus-BISINDO-DATASET
- Commit yang diaudit: `78c616244ad4def9e355d31d30b1a04d4ab63946`
- Lisensi: MIT
- Penggunaan: source holdout BISINDO, bukan primary training source

Copyright (c) 2024 Rhio Sutoyo. Teks lisensi tersedia di `dataset/licenses/MIT-BINUS.txt`.

## ASL Alphabet v1

- Judul: *ASL Alphabet*
- Pembuat: Akash Nagaraj (`grassknoted`)
- DOI: https://doi.org/10.34740/KAGGLE/DSV/29550
- Sumber: https://www.kaggle.com/datasets/grassknoted/asl-alphabet
- Lisensi yang dilaporkan Kaggle: GPL 2 (`GPL-2.0-only`)
- Cakupan di repository: `Website/public/reference/asl/`, catalog provenance, dan model ASL
- Perubahan reference images: hand-focused square crop, resize 640x640, konversi WebP, dan penghapusan metadata

Teks GPL-2.0 tersedia di `Website/public/licenses/GPL-2.0-only.txt`. Script untuk membangun ulang crop tersedia di `scripts/build_reference_assets.py`; versi sumber, manifest, dan aturan split tersedia di `dataset/manifests/`.

Status trained model sebagai derivative artifact dari dataset belum memiliki jawaban universal. SignSense mempertahankan provenance dan lisensi sumber tanpa menyatakan bahwa pemilik dataset mendukung proyek ini.

## MediaPipe Tasks Vision

- Package: `@mediapipe/tasks-vision` 1.0.1
- Pemilik: The MediaPipe Authors / Google
- Lisensi: Apache License 2.0
- Package: https://www.npmjs.com/package/@mediapipe/tasks-vision
- Penggunaan: browser Hand Landmarker runtime dan WASM

Teks lisensi Apache 2.0 tersedia di `Website/public/licenses/Apache-2.0.txt`.

MediaPipe mendokumentasikan pengiriman performance/utilization metrics. SignSense memproses frame di perangkat dan deployment menerapkan Content Security Policy `connect-src 'self'` untuk memblokir request non-origin.

## JavaScript and Python Dependencies

Dependency lain diinstal melalui `Website/package-lock.json` dan `requirements.txt`. Hak cipta serta lisensinya tetap dimiliki oleh masing-masing author. Daftar versi frontend dapat diaudit melalui `npm ls` dan metadata `license` di lockfile.

## No Endorsement

Penggunaan nama dataset, author, organisasi, dan produk hanya untuk atribusi. Tidak ada endorsement terhadap SignSense dari author atau penyedia dataset.
