import { describe, expect, it } from "vitest";
import { draculaTheme, editorialDark, editorialLight, nordTheme, tokyonightTheme } from "./theme.js";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const COLOR_ROLES = ["paper", "ink", "accent", "rule", "muted"] as const;

describe("Plan 03 Task 1: editorialDark (THEME-02)", () => {
  it("has the exact same key set as editorialLight — no role added or removed", () => {
    expect(Object.keys(editorialDark).sort()).toEqual(Object.keys(editorialLight).sort());
  });

  it("has all five color roles present and valid 6-digit hex codes in both themes", () => {
    for (const role of COLOR_ROLES) {
      expect(editorialLight[role]).toMatch(HEX_COLOR);
      expect(editorialDark[role]).toMatch(HEX_COLOR);
    }
  });

  it("matches the UI-SPEC Color table's dark column verbatim", () => {
    expect(editorialDark.paper).toBe("#1D1916");
    expect(editorialDark.ink).toBe("#EDE3D4");
    expect(editorialDark.accent).toBe("#C99A70");
    expect(editorialDark.rule).toBe("#4A3F35");
    expect(editorialDark.muted).toBe("#A28E78");
  });

  // RENDER-03 / adjacency: the key-set-equality assertion above only proves
  // the two themes have the same SHAPE — it would still pass if both themes
  // resolved to identical colors, which would make renderPair's "paired"
  // output meaningless. This is the independent value-divergence check.
  it("editorialLight.accent and editorialDark.accent are not equal (RENDER-03 / adjacency)", () => {
    expect(editorialLight.accent).not.toBe(editorialDark.accent);
  });
});

describe("Plan 04 Task 1: draculaTheme/nordTheme/tokyonightTheme (THEME-01/03/06/D-07)", () => {
  const ecosystemThemes = { dracula: draculaTheme, nord: nordTheme, tokyonight: tokyonightTheme };

  for (const [name, theme] of Object.entries(ecosystemThemes)) {
    it(`${name}: has the exact same key set as editorialLight — no role added or removed`, () => {
      expect(Object.keys(theme).sort()).toEqual(Object.keys(editorialLight).sort());
    });

    it(`${name}: all five color roles are valid 6-digit hex codes`, () => {
      for (const role of COLOR_ROLES) {
        expect(theme[role]).toMatch(HEX_COLOR);
      }
    });
  }

  it("matches the UI-SPEC Theme Registry table's dracula column verbatim", () => {
    expect(draculaTheme.paper).toBe("#282A36");
    expect(draculaTheme.ink).toBe("#F8F8F2");
    expect(draculaTheme.accent).toBe("#BD93F9");
    expect(draculaTheme.rule).toBe("#44475A");
    expect(draculaTheme.muted).toBe("#6272A4");
  });

  it("matches the UI-SPEC Theme Registry table's nord column verbatim", () => {
    expect(nordTheme.paper).toBe("#2E3440");
    expect(nordTheme.ink).toBe("#ECEFF4");
    expect(nordTheme.accent).toBe("#88C0D0");
    expect(nordTheme.rule).toBe("#4C566A");
    expect(nordTheme.muted).toBe("#D8DEE9");
  });

  it("matches the UI-SPEC Theme Registry table's tokyonight column verbatim", () => {
    expect(tokyonightTheme.paper).toBe("#1A1B26");
    expect(tokyonightTheme.ink).toBe("#C0CAF5");
    expect(tokyonightTheme.accent).toBe("#7AA2F7");
    expect(tokyonightTheme.rule).toBe("#3B4261");
    expect(tokyonightTheme.muted).toBe("#565F89");
  });
});
