import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppRoutes } from "../src/App";

function renderRoute(route: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[route]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

describe("public routes", () => {
  it("renders the landing page", () => {
    expect(renderRoute("/")).toContain("Kenali bentuk. Latih tangan. Tetap kritis.");
  });

  it("selects ASL from the alphabet query", () => {
    const markup = renderRoute("/belajar?mode=asl");
    expect(markup).toContain("<strong>ASL</strong> / 26 huruf / 2 dinamis");
    expect(markup).toContain("Alfabet yang berbeda.");
  });

  it("renders dynamic letter limitations", () => {
    const markup = renderRoute("/belajar/bisindo/z");
    expect(markup).toContain("Ini hanya satu frame.");
    expect(markup).toContain("Belum didukung");
  });

  it.each([
    ["/panduan", "Bantu kamera melihat tangan, bukan menebak."],
    ["/tentang", "Eksperimen pembelajaran, bukan penerjemah bahasa."],
    ["/alamat-tidak-ada", "Halaman tidak ditemukan."],
  ])("renders %s", (route, heading) => {
    expect(renderRoute(route)).toContain(heading);
  });
});
