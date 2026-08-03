import { describe, expect, it } from "vitest";
import { assertAdvanceWidthPreserved, AdvanceWidthDriftError } from "./build-fonts.js";

interface FakeFont {
  getAdvanceWidth(text: string, size: number): number;
}

function fakeFont(widths: Record<string, number>): FakeFont {
  return {
    getAdvanceWidth(text: string): number {
      if (!(text in widths)) {
        throw new Error(`fakeFont: no width configured for sample "${text}"`);
      }
      return widths[text];
    },
  };
}

describe("assertAdvanceWidthPreserved", () => {
  const samples = ["AV", "To", "0123456789"];

  it("does not throw when full and subset fonts agree on every sample", () => {
    const full = fakeFont({ AV: 80, To: 62, "0123456789": 550 });
    const subset = fakeFont({ AV: 80, To: 62, "0123456789": 550 });

    expect(() => assertAdvanceWidthPreserved(full, subset, samples, "fake-font")).not.toThrow();
  });

  it("throws AdvanceWidthDriftError naming the sample and both widths when they diverge", () => {
    const full = fakeFont({ AV: 80, To: 62, "0123456789": 550 });
    const subset = fakeFont({ AV: 80, To: 61, "0123456789": 550 });

    let caught: unknown;
    try {
      assertAdvanceWidthPreserved(full, subset, samples, "fake-font");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AdvanceWidthDriftError);
    const message = (caught as Error).message;
    expect(message).toContain("To");
    expect(message).toContain("fake-font");
    expect(message).toContain("62");
    expect(message).toContain("61");
  });

  it("reports the first diverging sample, not a generic message", () => {
    const full = fakeFont({ AV: 80, To: 62, "0123456789": 549 });
    const subset = fakeFont({ AV: 80, To: 62, "0123456789": 550 });

    expect(() => assertAdvanceWidthPreserved(full, subset, samples, "fake-font")).toThrowError(
      /0123456789/,
    );
  });
});
