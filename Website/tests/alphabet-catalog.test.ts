import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getAlphabet } from "../src/data/alphabet";

describe("generated alphabet catalog", () => {
  it.each([
    ["bisindo", 3],
    ["asl", 2],
  ] as const)("contains a complete %s alphabet", (mode, dynamicCount) => {
    const entries = getAlphabet(mode);
    expect(entries).toHaveLength(26);
    expect(new Set(entries.map((entry) => entry.letter)).size).toBe(26);
    expect(entries.filter((entry) => entry.form === "dynamic")).toHaveLength(dynamicCount);
    expect(entries.map((entry) => entry.letter).join("")).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  });

  it.each(["bisindo", "asl"] as const)("keeps provenance for every %s asset", (mode) => {
    for (const entry of getAlphabet(mode)) {
      expect(entry.sampleId).toMatch(/^[a-f0-9]{20}$/);
      expect(entry.originalSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.assetSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.sourceUrl).toMatch(/^https:\/\//);
      expect(entry.sourceAuthors.length).toBeGreaterThan(0);
      expect(entry.license).not.toBe("");
      expect(entry.reviewStatus).toBe("provisional");
      expect(entry.regionStatus).toBe("not-documented");
      expect(entry.frameOnly).toBe(entry.form === "dynamic");
      expect(entry.modelStatus).toBe(entry.form === "static" ? "recognized" : "deferred");
    }
  });

  it.each(["bisindo", "asl"] as const)("matches generated %s WebP files and hashes", (mode) => {
    for (const entry of getAlphabet(mode)) {
      const path = resolve("public", entry.assetPath);
      expect(existsSync(path), path).toBe(true);
      const content = readFileSync(path);
      expect(content.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(content.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(createHash("sha256").update(content).digest("hex")).toBe(entry.assetSha256);
    }
  });
});
