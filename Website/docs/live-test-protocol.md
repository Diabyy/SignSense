# BISINDO Live Smoke Test Protocol

## Scope

Pengujian ini mengukur integrasi kamera, MediaPipe, feature parity, MLP, dan UI pada satu pengguna. Hasilnya bukan external atau multi-user validation.

## Environment

- Desktop Chrome versi terbaru
- `http://localhost:5173`
- Kamera 720p atau lebih tinggi
- Pencahayaan depan yang cukup
- Background tanpa gerakan berlebihan

## Preflight

1. Jalankan `npm test`.
2. Jalankan `npm run build`.
3. Jalankan `npm run dev`.
4. Pastikan browser tidak mengunduh aset dari CDN.
5. Izinkan kamera dan pastikan overlay mengikuti tangan.
6. Pastikan FPS minimal 20 setelah warm-up.

## Test Matrix

- Lima percobaan untuk setiap pose statis.
- Sepuluh percobaan untuk `D/P/Q`, `A/B/X`, `I/U`, dan `Y`.
- Satu rangkaian pada jarak dekat.
- Satu rangkaian pada jarak sedang.
- Satu rangkaian pencahayaan normal.
- Satu rangkaian pencahayaan agak redup.

## Record Per Attempt

- Target letter
- Final stable prediction
- Confidence
- Detected hand count
- FPS
- Time until stable prediction
- Notes: detector miss, partial hand, or wrong class

## Ekspor dari Aplikasi

1. Aktifkan kamera lalu mulai `Mode Tantangan Huruf`.
2. Gunakan `Lewati` jika target tidak berhasil diselesaikan; attempt tersebut tetap dicatat.
3. Pastikan angka `Terekam` bertambah satu kali untuk setiap target selesai atau dilewati.
4. Tekan `Unduh hasil JSON` sebelum mengganti pengguna.
5. Tekan `Sesi baru` untuk membuat ID pseudonim baru bagi pengguna berikutnya.
6. Setelah beberapa signer selesai, gabungkan file melalui `/#/validasi` mengikuti
   `docs/validation-analysis.md`.

File ekspor memuat mode, target, prediksi stabil terakhir, confidence, jumlah tangan,
FPS, inference latency, durasi attempt, outcome, dan timestamp. File tidak memuat
nama, email, frame, gambar, video, atau landmark mentah. Simpan catatan kondisi uji
di lembar terpisah dengan ID sesi yang sama bila diperlukan.

## Runtime Gates

- FPS minimal 20 pada Desktop Chrome.
- Tidak ada stale prediction setelah tangan hilang.
- Kamera dapat dimatikan dan diaktifkan kembali.
- Tidak ada crash selama sesi 10 menit.
- Tidak ada network upload video.

## Interpretation

Pisahkan kegagalan menjadi detector failure, feature parity failure, classifier failure, dan pose/domain ambiguity. Jangan menyesuaikan model menggunakan holdout hanya untuk memperbaiki angka test.
