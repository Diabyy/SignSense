import { Link } from "react-router-dom";

const sources = [
  {
    mode: "BISINDO",
    license: "CC BY 4.0",
    title: "A Multimodal BISINDO Corpus",
    authors:
      "Lilis Nur Hayati; Anik Nur Handayani; Wahyu Sakti Gunawan Irianto; Rosa Andrie Asmara; Dolly Indra",
    copy: "Sumber utama foto referensi dan training. Crop web 640 x 640 diubah dari sampel training dan metadata dihapus.",
    href: "https://doi.org/10.17632/235c78xbmk.2",
    linkLabel: "DOI 10.17632/235c78xbmk.2",
  },
  {
    mode: "BISINDO",
    license: "CC BY 4.0",
    title: "BISINDO DATASET",
    authors: "Arya Raden; Muhammad Asshafi",
    copy: "Sumber training tambahan. Dataset tidak mendokumentasikan identitas signer atau wilayah untuk setiap gambar.",
    href: "https://doi.org/10.17632/4xnkvr88tk.1",
    linkLabel: "DOI 10.17632/4xnkvr88tk.1",
  },
  {
    mode: "BISINDO",
    license: "MIT",
    title: "BISINDO Hand-Sign Detection Using Transfer Learning",
    authors: "David Joan; Vincent Vincent; Kevin Jason Daniel; Said Achmad; Rhio Sutoyo",
    copy: "Dipakai sebagai source holdout, bukan primary training source. Copyright 2024 Rhio Sutoyo.",
    href: "https://doi.org/10.1109/ICRAIE59459.2023.10468194",
    linkLabel: "DOI publikasi",
  },
  {
    mode: "ASL",
    license: "GPL-2.0-only",
    title: "ASL Alphabet",
    authors: "Akash Nagaraj (Kaggle: grassknoted)",
    copy: "Sumber reference crop dan training ASL. Aset turunan mempertahankan provenance dan lisensi sumber.",
    href: "https://doi.org/10.34740/KAGGLE/DSV/29550",
    linkLabel: "DOI 10.34740/KAGGLE/DSV/29550",
  },
] as const;

const gplUrl = `${import.meta.env.BASE_URL}licenses/GPL-2.0-only.txt`;
const runtimeNoticesUrl = `${import.meta.env.BASE_URL}licenses/RUNTIME-NOTICES.txt`;

export function AboutPage() {
  return (
    <div className="page-shell about-page">
      <header className="page-intro about-intro">
        <div>
          <p className="eyebrow"><span />Tentang SignSense</p>
          <h1>Eksperimen pembelajaran, bukan penerjemah bahasa.</h1>
        </div>
        <p>
          SignSense membantu orang mengamati alfabet tangan dan mencoba model pengenalan
          statis. Bahasa isyarat lebih luas dari alfabet, melibatkan gerak, ekspresi, ruang,
          konteks, serta komunitas penuturnya.
        </p>
      </header>

      <section className="principles-grid">
        <article><span>01</span><h2>Data dapat ditelusuri</h2><p>Setiap foto referensi menyimpan sample ID, hash, sumber, crop, dan lisensi.</p></article>
        <article><span>02</span><h2>Batasan terlihat</h2><p>Huruf dinamis, variasi regional, dan risiko model tidak disembunyikan.</p></article>
        <article><span>03</span><h2>Frame tetap lokal</h2><p>Frame tidak dikirim atau disimpan; inference berlangsung di perangkat.</p></article>
      </section>

      <section className="sources-section">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow"><span />Sumber data</p>
            <h2>Foto berasal dari training corpus.</h2>
          </div>
          <p>
            Aset web adalah crop turunan beresolusi 640 x 640 tanpa metadata EXIF. Status
            review saat ini provisional sampai tersedia validasi komunitas yang relevan.
          </p>
        </div>
        <div className="source-list">
          {sources.map((source) => (
            <article key={`${source.mode}-${source.title}`}>
              <div><span>{source.mode}</span><strong>{source.license}</strong></div>
              <h3>{source.title}</h3>
              <p className="source-authors">{source.authors}</p>
              <p>{source.copy}</p>
              <a href={source.href} rel="noreferrer" target="_blank">
                {source.linkLabel} <span aria-hidden="true">-&gt;</span>
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="limitations-section">
        <div>
          <p className="mode-kicker">Privasi &amp; lisensi</p>
          <h2>Distribusi dijelaskan terbuka.</h2>
        </div>
        <ul>
          <li>Frame kamera diproses di browser dan tidak diunggah atau disimpan oleh aplikasi.</li>
          <li>Hosting tetap menerima metadata HTTP seperti IP, user agent, URL, dan waktu request.</li>
          <li>MediaPipe memuat telemetry teknis; deployment memblokir koneksi non-origin melalui CSP.</li>
          <li><a href={gplUrl}>Baca teks GPL-2.0 untuk aset ASL</a>.</li>
          <li><a href={runtimeNoticesUrl}>Baca lisensi runtime browser</a>.</li>
        </ul>
      </section>

      <section className="limitations-section">
        <div>
          <p className="mode-kicker">Yang belum dapat dilakukan</p>
          <h2>Batas sistem saat ini.</h2>
        </div>
        <ul>
          <li>Menerjemahkan kalimat atau percakapan bahasa isyarat.</li>
          <li>Mengenali lintasan huruf dinamis BISINDO J, R, Z dan ASL J, Z.</li>
          <li>Menentukan varian BISINDO dari daerah atau komunitas tertentu.</li>
          <li>Menggantikan pengajar atau penutur Tuli sebagai sumber belajar utama.</li>
        </ul>
      </section>

      <section className="about-cta">
        <h2>Mulai dari satu huruf.</h2>
        <p>Amati contoh, baca provenance, lalu praktikkan dengan sadar akan batasannya.</p>
        <Link className="button" to="/belajar">Buka galeri alfabet</Link>
      </section>
    </div>
  );
}
