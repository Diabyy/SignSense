import { Link } from "react-router-dom";
import type { AlphabetEntry } from "../data/alphabet";
import { referenceAssetUrl } from "../data/alphabet";

interface ReferenceCardProps {
  entry: AlphabetEntry;
  priority?: boolean;
}

export function ReferenceCard({ entry, priority = false }: ReferenceCardProps) {
  return (
    <Link
      className="reference-card"
      to={`/belajar/${entry.mode}/${entry.letter.toLowerCase()}`}
      aria-label={`Lihat detail huruf ${entry.letter} ${entry.mode.toUpperCase()}`}
    >
      <div className="reference-image-wrap">
        <img
          alt={entry.altText}
          className="reference-image"
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          src={referenceAssetUrl(entry)}
        />
        {entry.form === "dynamic" ? <span className="motion-badge">Perlu gerakan</span> : null}
      </div>
      <div className="reference-card-copy">
        <span className="reference-letter">{entry.letter}</span>
        <span className="reference-meta">
          {entry.expectedHands} tangan / {entry.form === "static" ? "statis" : "dinamis"}
        </span>
        <span className="card-arrow" aria-hidden="true">
          +
        </span>
      </div>
    </Link>
  );
}
