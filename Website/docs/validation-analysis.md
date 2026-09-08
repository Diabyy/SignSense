# Analisis Validasi Multi-Signer

## Tujuan

Halaman `/#/validasi` menggabungkan laporan JSON yang diekspor dari Mode Tantangan Huruf. Alat ini membantu menemukan huruf yang sulit, prediksi yang sering muncul ketika target gagal, detector miss, dan performa runtime.

Dashboard ini bukan bukti signer-independent dengan sendirinya. Kesimpulan hanya sah jika file berasal dari pengguna baru yang tidak digunakan dalam training atau tuning model.

## Prosedur

1. Gunakan satu sesi baru untuk setiap signer.
2. Jalankan protokol BISINDO atau ASL tanpa mencampur mode dalam satu sesi.
3. Unduh JSON sebelum mengganti mode, refresh, atau menutup tab.
4. Buka `/#/validasi`.
5. Pilih beberapa file JSON dari mode yang sama.
6. Simpan catatan kondisi pencahayaan, jarak, perangkat, dan detector failure secara terpisah menggunakan ID sesi pseudonim.

Semua file dibaca lokal oleh browser. Halaman analisis tidak mengunggah laporan.

## Guard Integritas

- Hanya schema laporan SignSense v1 yang diterima.
- JSON malformed atau field wajib yang hilang ditolak.
- ID sesi duplikat ditolak agar signer yang sama tidak dihitung dua kali.
- Laporan BISINDO dan ASL harus dianalisis terpisah.
- Nilai metrik harus berupa angka finite.

## Metrik

- **Completion rate:** proporsi attempt yang mencapai hold stabil.
- **UNKNOWN rate:** proporsi attempt dengan prediksi terakhir `UNKNOWN`.
- **Detector miss rate:** proporsi attempt dengan nol tangan terdeteksi pada snapshot terakhir.
- **Mean inference:** rerata latency inference per attempt.
- **Mean completion:** rerata waktu aktif kamera hingga attempt berhasil; waktu kamera mati tidak dihitung.
- **Prediksi tercatat:** confusion counts target → prediksi terakhir, termasuk attempt yang dilewati.

## Interpretasi

Gunakan metrik per huruf untuk menentukan prioritas investigasi, bukan langsung mengubah threshold berdasarkan data holdout. Pisahkan:

1. detector failure (`detectedHands = 0`);
2. hand-count/parity failure;
3. classifier confusion;
4. pose atau domain ambiguity;
5. runtime/perangkat lambat.

Jangan mengklaim generalisasi multi-user jika seluruh file berasal dari satu orang. Jangan memasukkan nama, email, foto, video, atau landmark mentah ke catatan pendamping.
