# ASL Live Smoke Test Protocol

## Scope

Pengujian mengukur integrasi kamera, fallback detector, feature parity, classifier ASL, dan mode switching pada satu pengguna. Hasilnya bukan signer-independent atau multi-user validation.

## Preflight

1. Jalankan `npm test`, `npm run typecheck`, dan `npm run build`.
2. Buka aplikasi melalui Desktop Chrome pada `localhost`.
3. Pilih ASL sebelum mengaktifkan kamera.
4. Pastikan label mode, cakupan alfabet, dan deferred letters berubah menjadi ASL.
5. Izinkan kamera dan tunggu FPS stabil.

## Attempts

- Lima percobaan untuk masing-masing 24 pose statis.
- Sepuluh percobaan tambahan untuk `A`, `B`, `M`, `N`, `P`, dan `X`.
- Ulangi `A` dan `N` pada jarak dekat, sedang, dan jauh.
- Pastikan wrist terlihat penuh pada setidaknya satu rangkaian.
- Ganti ASL ke BISINDO dan kembali ke ASL untuk memastikan tidak ada state atau transcript lintas mode.

## Record

- Target letter.
- Stable prediction dan confidence.
- Detected hand count.
- FPS dan inference latency.
- Time until stable prediction.
- Detector miss, false hand, wrong class, atau stale mode output.

## Runtime Gates

- Tidak ada output model lama setelah mode berganti.
- Tidak ada stale prediction setelah tangan hilang.
- Camera tracks berhenti ketika mode diganti.
- Camera tracks dan detector berhenti setelah frame-processing error.
- FPS target minimal 20 pada kondisi normal; catat terpisah FPS ketika seluruh fallback aktif.
- Tidak ada `Packet timestamp mismatch` atau error `norm_rect` pada console saat fallback padding aktif.
- Tidak ada network upload video atau frame.
