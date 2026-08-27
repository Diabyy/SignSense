import { describe, expect, it } from "vitest";

import { MODE_CONFIGS } from "../src/lib/modes";

describe("sign mode catalog", () => {
  it("keeps BISINDO and ASL models and alphabets separate", () => {
    expect(MODE_CONFIGS.bisindo.modelUrl).not.toBe(MODE_CONFIGS.asl.modelUrl);
    expect(MODE_CONFIGS.bisindo.staticLetters).toHaveLength(23);
    expect(MODE_CONFIGS.asl.staticLetters).toHaveLength(24);
    expect(MODE_CONFIGS.bisindo.dynamicLetters).toEqual(["J", "R", "Z"]);
    expect(MODE_CONFIGS.asl.dynamicLetters).toEqual(["J", "Z"]);
  });

  it.each(Object.values(MODE_CONFIGS))("has disjoint static and dynamic classes for $label", (mode) => {
    expect(mode.staticLetters).not.toContain("UNKNOWN");
    expect(mode.staticLetters.filter((letter) => mode.dynamicLetters.includes(letter))).toEqual([]);
  });

  it("keeps the ASL validation-selected detector cascade", () => {
    expect(MODE_CONFIGS.asl.detector).toEqual({
      primaryConfidence: 0.35,
      fallbackConfidence: 0.2,
      paddingRatio: 0.5,
      paddingConfidence: 0.2,
    });
  });
});
