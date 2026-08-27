import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface HeaderRule {
  source: string;
  headers: Array<{ key: string; value: string }>;
}

describe("public deployment controls", () => {
  const vercelConfig = JSON.parse(
    readFileSync(resolve("..", "vercel.json"), "utf8"),
  ) as {
    installCommand: string;
    buildCommand: string;
    outputDirectory: string;
    headers: HeaderRule[];
  };

  it("builds the website from the repository root", () => {
    expect(vercelConfig.installCommand).toBe("npm --prefix Website ci");
    expect(vercelConfig.buildCommand).toContain("npm --prefix Website test");
    expect(vercelConfig.buildCommand).toContain("npm --prefix Website run typecheck");
    expect(vercelConfig.outputDirectory).toBe("Website/dist");
  });

  it("blocks non-origin telemetry and restricts camera permission", () => {
    const globalHeaders = vercelConfig.headers.find((rule) => rule.source === "/(.*)")!;
    const csp = globalHeaders.headers.find(
      (header) => header.key === "Content-Security-Policy",
    )!.value;
    const permissions = globalHeaders.headers.find(
      (header) => header.key === "Permissions-Policy",
    )!.value;

    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("odml.pa.googleapis.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(permissions).toContain("camera=(self)");
    expect(permissions).toContain("microphone=()");
  });

  it("ships license texts and prevents temporary demo indexing", () => {
    expect(existsSync(resolve("public", "licenses", "GPL-2.0-only.txt"))).toBe(true);
    expect(existsSync(resolve("public", "licenses", "Apache-2.0.txt"))).toBe(true);
    expect(existsSync(resolve("public", "licenses", "RUNTIME-NOTICES.txt"))).toBe(true);

    const index = readFileSync(resolve("index.html"), "utf8");
    const robots = readFileSync(resolve("public", "robots.txt"), "utf8");
    expect(index).toContain('content="noindex, nofollow, noarchive"');
    expect(robots).toContain("Disallow: /");
  });

  it("keeps raw data out of Vercel while retaining frontend tests", () => {
    const vercelIgnore = readFileSync(resolve("..", ".vercelignore"), "utf8");
    expect(vercelIgnore).toContain("/dataset/");
    expect(vercelIgnore).toContain("/scripts/");
    expect(vercelIgnore).toContain("/tests/");
    expect(vercelIgnore).toContain("/Website/node_modules/");
    expect(vercelIgnore).not.toContain("/Website/tests/");
    expect(vercelIgnore).not.toContain("parity-fixture.json");
  });
});
