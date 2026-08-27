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

Jika test mode ditambahkan, log hanya boleh memuat target, prediksi, confidence, jumlah tangan, FPS, dan timestamp. Video atau gambar tidak boleh direkam secara default.
