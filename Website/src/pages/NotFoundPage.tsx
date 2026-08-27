import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="page-shell not-found-page">
      <p className="eyebrow"><span />404</p>
      <h1>Halaman tidak ditemukan.</h1>
      <p>Alamat ini tidak tersedia di SignSense.</p>
      <Link className="button" to="/">Kembali ke beranda</Link>
    </div>
  );
}
