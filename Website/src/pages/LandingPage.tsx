import { Link } from "react-router-dom";
import { getAlphabet, referenceAssetUrl } from "../data/alphabet";

const heroLetters = ["A", "D", "L", "W", "Y"];
const bisindoPreview = ["A", "C", "F", "V"];
const aslPreview = ["B", "D", "L", "Y"];

function previewEntries(mode: "bisindo" | "asl", letters: string[]) {
  const entries = getAlphabet(mode);
  return letters.map((letter) => entries.find((entry) => entry.letter === letter)!);
}

export function LandingPage() {
  const heroEntries = previewEntries("bisindo", heroLetters);

  return (
    <>
      <section className="hero section-shell">
        <div className="hero-copy">
          <p className="eyebrow"><span />Belajar dari data nyata</p>
          <h1>Kenali bentuk. Latih tangan. Tetap kritis.</h1>
          <p className="hero-lead">
            Jelajahi alfabet BISINDO dan ASL, lalu uji bentuk tangan statis langsung di
            kamera. Setiap contoh terhubung ke data training dan batasannya.
          </p>
          <div className="hero-actions">
            <Link className="button" to="/belajar">
              Mulai belajar
            </Link>
            <Link className="text-link" to="/kamera/bisindo">
              Coba kamera <span aria-hidden="true">-&gt;</span>
            </Link>
          </div>
          <p className="hero-footnote">Tanpa akun; frame kamera diproses lokal dan tidak diunggah.</p>
        </div>
        <div className="hero-gallery" aria-label="Contoh alfabet BISINDO dari data training">
          {heroEntries.map((entry, index) => (
            <Link
              className={`hero-tile hero-tile-${index + 1}`}
              key={entry.letter}
              to={`/belajar/bisindo/${entry.letter.toLowerCase()}`}
            >
              <img alt={entry.altText} src={referenceAssetUrl(entry)} />
              <span>{entry.letter}</span>
            </Link>
          ))}
          <div className="hero-stamp" aria-hidden="true">
            <span>26</span>
            huruf
          </div>
        </div>
      </section>

      <section className="proof-strip" aria-label="Ringkasan SignSense">
        <div><strong>52</strong><span>referensi huruf</span></div>
        <div><strong>2</strong><span>alfabet untuk dipelajari</span></div>
        <div><strong>Lokal</strong><span>inferensi kamera</span></div>
        <div><strong>Terbuka</strong><span>sumber dan batasan</span></div>
      </section>

      <section className="steps-section section-shell">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow"><span />Cara belajar</p>
            <h2>Satu huruf, tiga langkah.</h2>
          </div>
          <p>
            Bukan sekadar kartu hafalan. Amati jumlah tangan, pahami apakah bentuknya
            statis atau bergerak, lalu praktikkan dengan jarak kamera yang tepat.
          </p>
        </div>
        <div className="steps-grid">
          <article><span>01</span><h3>Pilih alfabet</h3><p>Mulai dari BISINDO atau bandingkan dengan ASL.</p></article>
          <article><span>02</span><h3>Amati bentuk</h3><p>Buka detail huruf dan perhatikan tangan serta status gerak.</p></article>
          <article><span>03</span><h3>Praktikkan</h3><p>Uji huruf statis di kamera tanpa mengunggah rekaman.</p></article>
        </div>
      </section>

      <section className="alphabet-showcase section-shell">
        <ShowcaseRow
          copy="Bentuk alfabet dari corpus BISINDO yang dipakai untuk melatih model SignSense. Variasi komunitas dan daerah tetap mungkin terjadi."
          entries={previewEntries("bisindo", bisindoPreview)}
          label="BISINDO"
          mode="bisindo"
          title="Mulai dari bahasa isyarat Indonesia."
        />
        <ShowcaseRow
          copy="Referensi pembanding ASL dari dataset training terpisah. Jangan menganggap bentuk ASL dan BISINDO dapat saling menggantikan."
          entries={previewEntries("asl", aslPreview)}
          label="ASL"
          mode="asl"
          title="Bandingkan, bukan campurkan."
        />
      </section>

      <section className="privacy-band section-shell">
        <div className="privacy-mark" aria-hidden="true">ON DEVICE</div>
        <div>
          <p className="eyebrow"><span />Privasi kamera</p>
          <h2>Frame berhenti di perangkat Anda.</h2>
          <p>
            SignSense memproses landmark tangan di browser. Tidak ada frame yang dikirim
            ke server atau disimpan oleh aplikasi.
          </p>
        </div>
        <Link className="button button-outline" to="/panduan">Baca panduan</Link>
      </section>
    </>
  );
}

interface ShowcaseRowProps {
  copy: string;
  entries: ReturnType<typeof getAlphabet>;
  label: string;
  mode: "bisindo" | "asl";
  title: string;
}

function ShowcaseRow({ copy, entries, label, mode, title }: ShowcaseRowProps) {
  return (
    <article className="showcase-row">
      <div className="showcase-copy">
        <span className="mode-kicker">{label}</span>
        <h2>{title}</h2>
        <p>{copy}</p>
        <Link className="text-link" to={`/belajar?mode=${mode}`}>
          Lihat semua huruf <span aria-hidden="true">-&gt;</span>
        </Link>
      </div>
      <div className="showcase-images">
        {entries.map((entry) => (
          <Link key={entry.letter} to={`/belajar/${mode}/${entry.letter.toLowerCase()}`}>
            <img alt={entry.altText} loading="lazy" src={referenceAssetUrl(entry)} />
            <span>{entry.letter}</span>
          </Link>
        ))}
      </div>
    </article>
  );
}
