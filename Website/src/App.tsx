import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AboutPage } from "./pages/AboutPage";
import { AlphabetPage } from "./pages/AlphabetPage";
import { GuidePage } from "./pages/GuidePage";
import { LandingPage } from "./pages/LandingPage";
import { LetterDetailPage } from "./pages/LetterDetailPage";
import { NotFoundPage } from "./pages/NotFoundPage";

const RecognizerPage = lazy(() => import("./pages/RecognizerPage"));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LandingPage />} />
          <Route path="belajar" element={<AlphabetPage />} />
          <Route path="belajar/:mode/:letter" element={<LetterDetailPage />} />
          <Route path="panduan" element={<GuidePage />} />
          <Route path="tentang" element={<AboutPage />} />
          <Route
            path="kamera/:mode"
            element={
              <Suspense fallback={<div className="route-loader">Menyiapkan modul kamera...</div>}>
                <RecognizerPage />
              </Suspense>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
