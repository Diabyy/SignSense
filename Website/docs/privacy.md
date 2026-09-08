# Privacy

## Camera Processing

- Browser meminta akses kamera hanya setelah pengguna menekan tombol aktivasi.
- Video diproses langsung oleh MediaPipe di browser.
- Frame kamera tidak dikirim ke backend atau layanan cloud.
- Frame kamera tidak ditulis ke disk oleh aplikasi.
- Kamera dihentikan ketika pengguna menekan `Matikan kamera` atau meninggalkan halaman.

## Models and WASM

Model Hand Landmarker, classifier BISINDO/ASL, JavaScript, dan WASM disajikan dari origin aplikasi. Setelah aset mode terpilih dimuat, inference tidak membutuhkan layanan inference eksternal.

Package MediaPipe Tasks Vision memuat kode telemetry yang dapat mencoba mengirim performance dan utilization metrics ke `https://odml.pa.googleapis.com/v1/log`. Deployment Vercel SignSense memasang Content Security Policy `connect-src 'self'`, sehingga koneksi non-origin tersebut diblokir oleh browser. Kebijakan ini harus diverifikasi ulang apabila hosting atau header deployment berubah.

## Hosting Metadata

SignSense tidak memiliki akun pengguna, analytics aplikasi, atau backend sendiri. Seperti website publik lain, penyedia hosting menerima metadata HTTP yang diperlukan untuk menyajikan aset, misalnya alamat IP, user agent, URL, dan waktu request. Retensi metadata tersebut mengikuti kebijakan penyedia hosting.

## Transcript

Transcript hanya disimpan pada React state selama halaman terbuka. Refresh atau menutup tab menghapus transcript.

## Live Test Logs

Mode tantangan menyimpan log validasi hanya di React state selama halaman terbuka.
Log pseudonim memuat ID sesi acak, mode, target, prediksi, confidence, jumlah tangan, FPS,
inference latency, durasi, outcome, dan timestamp. Log tidak memuat nama, email,
frame, gambar, video, atau landmark mentah.

Pengguna dapat mengunduh laporan JSON secara eksplisit. File dibuat langsung di
browser dan tidak diunggah ke SignSense. Memulai sesi baru, mengganti mode, refresh,
atau menutup tab menghapus log yang belum diunduh.

Halaman analisis membaca beberapa laporan JSON langsung di browser. Laporan tidak
diunggah, dan hasil agregat hanya berada di React state selama halaman terbuka.
