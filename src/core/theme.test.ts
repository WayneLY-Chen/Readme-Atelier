import { describe, expect, it } from "vitest";
import { editorialDark, editorialLight } from "./theme.js";

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
