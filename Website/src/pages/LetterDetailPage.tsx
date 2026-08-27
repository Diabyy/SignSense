import { Link, Navigate, useParams } from "react-router-dom";
import { getAlphabet, getLetter, isSignMode, referenceAssetUrl } from "../data/alphabet";
import { MODE_CONFIGS } from "../lib/modes";

export function LetterDetailPage() {
  const { mode: requestedMode, letter } = useParams();
  if (!isSignMode(requestedMode)) {
    return <Navigate replace to="/belajar" />;
  }
  const entry = getLetter(requestedMode, letter);
  if (!entry) {
    return <Navigate replace to={`/belajar?mode=${requestedMode}`} />;
  }

  const alphabet = getAlphabet(requestedMode);
  const index = alphabet.findIndex((item) => item.letter === entry.letter);
  const previous = alphabet[(index - 1 + alphabet.length) % alphabet.length]!;
  const next = alphabet[(index + 1) % alphabet.length]!;
  const config = MODE_CONFIGS[requestedMode];

  return (
    <div className="page-shell letter-page">
      <Link className="back-link" to={`/belajar?mode=${requestedMode}`}>
        <span aria-hidden="true">&lt;-</span> Kembali ke alfabet {config.label}
      </Link>

      <article className="letter-layout">
        <div className="letter-visual">
          <img alt={entry.altText} src={referenceAssetUrl(entry)} />
          <span className="dataset-ribbon">Sampel data training</span>
        </div>
        <div className="letter-copy">
          <div className="letter-title-row">
            <div>
              <p className="eyebrow"><span />Huruf {config.label}</p>
              <h1>{entry.letter}</h1>
            </div>
            <span className={`form-pill ${entry.form}`}>
              {entry.form === "static" ? "Statis" : "Dinamis"}
            </span>
          </div>
          <p className="letter-summary">
            Bentuk ini menggunakan <strong>{entry.expectedHands} tangan</strong>. Foto
            menunjukkan contoh dari data training, sehingga posisi, pencahayaan, dan subjek
            dapat berbeda saat Anda mempraktikkannya.
          </p>

          <dl className="letter-facts">
            <div><dt>Jumlah tangan</dt><dd>{entry.expectedHands}</dd></div>
            <div><dt>Bentuk</dt><dd>{entry.form === "static" ? "Ditahan" : "Perlu gerakan"}</dd></div>
            <div><dt>Status kamera</dt><dd>{entry.modelStatus === "recognized" ? "Didukung" : "Belum didukung"}</dd></div>
            <div><dt>Status review</dt><dd>Provisional</dd></div>
          </dl>

          {entry.frameOnly ? (
            <aside className="detail-callout dynamic-callout">
              <strong>Ini hanya satu frame.</strong>
              <p>
                Huruf {entry.letter} membutuhkan lintasan gerak. Jangan meniru foto ini
                sebagai gerakan lengkap, dan model kamera belum dapat mengenalinya.
              </p>
            </aside>
          ) : (
            <aside className="detail-callout">
              <strong>Siap diuji di kamera.</strong>
              <p>Jaga seluruh tangan dan wrist terlihat, lalu tahan pose secara stabil.</p>
            </aside>
          )}

          {requestedMode === "bisindo" ? (
            <p className="region-reminder">
              Catatan: bentuk BISINDO dapat bervariasi. Wilayah penutur pada sampel ini
              tidak didokumentasikan oleh dataset.
            </p>
          ) : null}

          {entry.modelStatus === "recognized" ? (
            <Link className="button" to={`/kamera/${requestedMode}`}>
              Praktikkan di kamera
            </Link>
          ) : (
            <Link className="button button-outline" to="/panduan">
              Pelajari batasan gerak
            </Link>
          )}
        </div>
      </article>

      <details className="provenance-panel">
        <summary>Lihat sumber dan provenance gambar</summary>
        <div className="provenance-grid">
          <div><span>Sumber</span><strong>{entry.sourceName}</strong></div>
          <div><span>Pembuat</span><strong>{entry.sourceAuthors.join("; ")}</strong></div>
          <div><span>Sampel training</span><code>{entry.sampleId}</code></div>
          <div><span>SHA asli</span><code>{entry.originalSha256.slice(0, 16)}...</code></div>
          <div><span>Transformasi</span><strong>{entry.transformation}</strong></div>
          <div>
            <span>Lisensi</span>
            <a href={entry.licenseUrl} rel="noreferrer" target="_blank">{entry.license}</a>
          </div>
          <div>
            <span>Dataset</span>
            <a href={entry.sourceUrl} rel="noreferrer" target="_blank">
              {entry.sourceDoi ?? "Buka halaman sumber"}
            </a>
          </div>
        </div>
      </details>

      <nav className="letter-pagination" aria-label="Navigasi huruf">
        <Link to={`/belajar/${requestedMode}/${previous.letter.toLowerCase()}`}>
          <span>Sebelumnya</span><strong>{previous.letter}</strong>
        </Link>
        <Link to={`/belajar/${requestedMode}/${next.letter.toLowerCase()}`}>
          <span>Berikutnya</span><strong>{next.letter}</strong>
        </Link>
      </nav>
    </div>
  );
}
