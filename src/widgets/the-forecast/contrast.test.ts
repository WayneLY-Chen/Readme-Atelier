import { describe, expect, it } from "vitest";
import { draculaTheme, editorialDark, editorialLight, nordTheme, tokyonightTheme } from "../../core/theme.js";
import { contrastRatio, numeralFillFor } from "./contrast.js";

const RATIO_TOLERANCE = 0.01;

describe("contrastRatio — WCAG 2.x relative-luminance arithmetic", () => {
  it("black on white is exactly 21 (the WCAG-defined maximum), within tolerance", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 2);
  });

  it("is symmetric in its two arguments", () => {
    const a = contrastRatio("#8B5E3C", "#F7F1E7");
    const b = contrastRatio("#F7F1E7", "#8B5E3C");
    expect(a).toBeCloseTo(b, 10);
  });

  it("a color against itself is exactly 1", () => {
    expect(contrastRatio("#302A25", "#302A25")).toBeCloseTo(1, 6);
  });
});

describe("V-05 — numeralFillFor pins the resulting fill PER THEME (06-VALIDATION.md V-05, 06-UI-SPEC.md Rule C-2)", () => {
  it("editorial light: muted:paper ratio ~5.80 -> muted", () => {
    const result = numeralFillFor(editorialLight);
    expect(result.source).toBe("muted");
    expect(result.fill).toBe(editorialLight.muted);
    expect(result.ratio).toBeCloseTo(5.8, RATIO_TOLERANCE);
  });

  it("editorial dark: muted:paper ratio ~5.55 -> muted", () => {
    const result = numeralFillFor(editorialDark);
    expect(result.source).toBe("muted");
    expect(result.fill).toBe(editorialDark.muted);
    expect(result.ratio).toBeCloseTo(5.55, RATIO_TOLERANCE);
  });

  it("nord: muted:paper ratio ~9.25 -> muted", () => {
    const result = numeralFillFor(nordTheme);
    expect(result.source).toBe("muted");
    expect(result.fill).toBe(nordTheme.muted);
    expect(result.ratio).toBeCloseTo(9.25, RATIO_TOLERANCE);
  });

  it("dracula: muted:paper ratio ~3.03 -> falls back to ink", () => {
    const result = numeralFillFor(draculaTheme);
    expect(result.source).toBe("ink");
    expect(result.fill).toBe(draculaTheme.ink);
    expect(result.ratio).toBeCloseTo(3.03, RATIO_TOLERANCE);
  });

  it("tokyonight: muted:paper ratio ~2.76 -> falls back to ink", () => {
    const result = numeralFillFor(tokyonightTheme);
    expect(result.source).toBe("ink");
    expect(result.fill).toBe(tokyonightTheme.ink);
    expect(result.ratio).toBeCloseTo(2.76, RATIO_TOLERANCE);
  });

  it("the branch reads theme VALUES, never theme.mode — a dark theme (nord) can still resolve to muted", () => {
    // nord's mode is "dark" yet its fill source is "muted" (ratio 9.25 >=
    // 4.5) — proof the branch is not secretly keyed on theme.mode.
    expect(nordTheme.mode).toBe("dark");
    expect(numeralFillFor(nordTheme).source).toBe("muted");
  });
});
