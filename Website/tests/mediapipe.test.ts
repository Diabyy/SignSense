import { describe, expect, it } from "vitest";

import { nextVideoTimestamp } from "../src/lib/mediapipe";

describe("MediaPipe video timestamps", () => {
  it("uses whole milliseconds and advances monotonically", () => {
    const first = nextVideoTimestamp(null, 8225849.0012);
    const second = nextVideoTimestamp(first, 8225849.0013);
    const later = nextVideoTimestamp(second, 8225865.2);

    expect(first).toBe(8225850);
    expect(second).toBe(8225851);
    expect(later).toBe(8225866);
  });
});
