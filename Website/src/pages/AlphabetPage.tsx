import { useSearchParams } from "react-router-dom";
import { ModeTabs } from "../components/ModeTabs";
import { ReferenceCard } from "../components/ReferenceCard";
import { getAlphabet, isSignMode } from "../data/alphabet";
import { MODE_CONFIGS, type SignMode } from "../lib/modes";

export function AlphabetPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMode = searchParams.get("mode") ?? undefined;
  const mode: SignMode = isSignMode(requestedMode) ? requestedMode : "bisindo";
  const config = MODE_CONFIGS[mode];
  const entries = getAlphabet(mode);

  function changeMode(nextMode: SignMode) {
    setSearchParams(nextMode === "bisindo" ? {} : { mode: nextMode });
  }

  return (
    <div className="page-shell alphabet-page">
      <header className="page-intro">
        <div>
          <p className="eyebrow"><span />Galeri alfabet</p>
          <h1>Pilih huruf untuk dipelajari.</h1>
        </div>
        <p>
          Foto di bawah adalah turunan sampel training, bukan ilustrasi buatan atau
          standar universal. Buka kartu untuk melihat provenance dan status model.
        </p>
      </header>

      <div className="alphabet-toolbar">
        <ModeTabs mode={mode} onChange={changeMode} />
        <p><strong>{config.label}</strong> / 26 huruf / {config.dynamicLetters.length} dinamis</p>
      </div>

      {mode === "bisindo" ? (
        <aside className="notice notice-region" aria-label="Catatan variasi BISINDO">
          <strong>Variasi itu wajar.</strong>
          <span>
            Bentuk BISINDO dapat berbeda antardaerah dan komunitas. Wilayah penutur pada
            foto training ini tidak terdokumentasi, jadi contoh tidak diberi label daerah.
          </span>
        </aside>
      ) : (
        <aside className="notice" aria-label="Catatan ASL">
          <strong>Alfabet yang berbeda.</strong>
          <span>ASL ditampilkan sebagai pembanding dan tidak menggantikan bentuk BISINDO.</span>
        </aside>
      )}

      <section className="alphabet-grid" aria-label={`Alfabet ${config.label}`}>
        {entries.map((entry, index) => (
          <ReferenceCard entry={entry} key={entry.letter} priority={index < 4} />
        ))}
      </section>

      <aside className="dynamic-explainer">
        <span className="dynamic-icon" aria-hidden="true">~</span>
        <div>
          <h2>Huruf dinamis tidak selesai dalam satu foto.</h2>
          <p>
            {config.deferredCopy} Kartu huruf dinamis hanya menunjukkan satu frame dari
            data, bukan arah atau lintasan gerakan yang lengkap.
          </p>
        </div>
      </aside>
    </div>
  );
}
