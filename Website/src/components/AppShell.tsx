import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Beranda", end: true },
  { to: "/belajar", label: "Belajar", end: false },
  { to: "/panduan", label: "Panduan", end: false },
  { to: "/tentang", label: "Tentang", end: false },
] as const;

export function AppShell() {
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Lewati ke konten
      </a>
      <header className="site-header">
        <NavLink className="site-brand" to="/" aria-label="SignSense beranda">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>SignSense</span>
        </NavLink>
        <nav className="site-nav" aria-label="Navigasi utama">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) => `nav-link${isActive ? " is-active" : ""}`}
              end={item.end}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <NavLink className="button button-small header-cta" to="/kamera/bisindo">
          Buka kamera
        </NavLink>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div>
          <NavLink className="footer-brand" to="/">
            SignSense
          </NavLink>
          <p>Belajar bentuk tangan dari data nyata, dengan batasan yang dijelaskan terbuka.</p>
        </div>
        <div className="footer-links" aria-label="Tautan footer">
          <NavLink to="/belajar">Galeri alfabet</NavLink>
          <NavLink to="/panduan">Panduan kamera</NavLink>
          <NavLink to="/tentang">Sumber data</NavLink>
        </div>
        <p className="footer-note">Frame kamera diproses lokal dan tidak diunggah oleh aplikasi.</p>
      </footer>
    </div>
  );
}
