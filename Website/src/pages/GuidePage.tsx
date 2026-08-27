import { Link } from "react-router-dom";

const checklist = [
  "Gunakan cahaya yang merata dari arah depan.",
  "Pastikan telapak, jari, dan wrist masuk ke frame.",
  "Beri jarak agar tangan tidak memenuhi seluruh kamera.",
  "Jauhkan tangan lain jika huruf hanya memakai satu tangan.",
];

export function GuidePage() {
  return (
    <div className="page-shell guide-page">
      <header className="page-intro guide-intro">
        <div>
          <p className="eyebrow"><span />Panduan praktik</p>
          <h1>Bantu kamera melihat tangan, bukan menebak.</h1>
        </div>
        <p>
          Pengenalan SignSense masih eksperimental. Posisi kamera yang baik membantu
          detector, tetapi hasil tetap bukan terjemahan resmi atau penilaian kefasihan.
        </p>
      </header>

      <section className="guide-board">
        <div className="guide-number">01</div>
        <div className="guide-copy">
          <p className="mode-kicker">Sebelum mulai</p>
          <h2>Siapkan frame yang bersih.</h2>
          <ul className="checklist">
            {checklist.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className="frame-demo" aria-label="Ilustrasi area tangan dalam kamera">
          <span className="frame-corner corner-one" />
          <span className="frame-corner corner-two" />
          <span className="frame-corner corner-three" />
          <span className="frame-corner corner-four" />
          <div className="hand-placeholder" aria-hidden="true">HAND</div>
          <p>Jaga wrist terlihat</p>
        </div>
      </section>

      <section className="guide-board guide-board-reverse">
        <div className="guide-number">02</div>
        <div className="guide-copy">
          <p className="mode-kicker">Saat praktik</p>
          <h2>Tahan pose, baca hasil dengan hati-hati.</h2>
          <p>
            Untuk huruf statis, tahan pose sejenak agar smoothing mengurangi prediksi yang
            bergetar. Label UNKNOWN berarti model belum cukup yakin atau jumlah tangan tidak
            cocok, bukan berarti bentuk Anda pasti salah.
          </p>
          <div className="status-key">
            <span><i className="key-dot ready" />READY: model siap</span>
            <span><i className="key-dot unknown" />UNKNOWN: belum yakin</span>
          </div>
        </div>
        <div className="confidence-demo">
          <span>Prediksi contoh</span>
          <strong>A</strong>
          <div><i style={{ width: "86%" }} /></div>
          <p>86% confidence</p>
        </div>
      </section>

      <section className="movement-section">
        <div className="movement-heading">
          <p className="eyebrow"><span />Batas gerakan</p>
          <h2>Beberapa huruf tidak dapat dibaca dari satu frame.</h2>
        </div>
        <div className="movement-cards">
          <article><span>BISINDO</span><strong>J / R / Z</strong><p>Memerlukan gerakan dan belum menjadi output model statis.</p></article>
          <article><span>ASL</span><strong>J / Z</strong><p>Memerlukan lintasan gerak dan belum menjadi output model statis.</p></article>
        </div>
      </section>

      <section className="privacy-detail">
        <div className="privacy-lock" aria-hidden="true">LOCAL</div>
        <div>
          <p className="mode-kicker">Privasi</p>
          <h2>Kamera aktif hanya setelah Anda menekan mulai.</h2>
          <p>
            Frame diproses di browser untuk menghasilkan landmark tangan. Aplikasi tidak
            mengunggah atau menyimpan frame. Saat Anda meninggalkan halaman kamera, track dan
            detector ditutup.
          </p>
        </div>
        <Link className="button" to="/kamera/bisindo">Buka kamera</Link>
      </section>
    </div>
  );
}
