import type { Theme } from "./model.js";

// PROJECT.md locked palette values — copied verbatim, not reinterpreted.
export const editorialLight: Theme = {
  name: "editorial",
  mode: "light",
  paper: "#F7F1E7",
  ink: "#302A25",
  accent: "#8B5E3C",
  rule: "#CDBDA8",
  muted: "#6B5B4B",
};

// 01-UI-SPEC.md "Color" table's dark column — this phase's own derivation,
// WCAG-contrast-verified there. Copied verbatim, not reinterpreted. Same
// five semantic roles as editorialLight, no new hue introduced (RENDER-03 /
// THEME-02: a derived dark theme is the same roles with different values,
// never a new role or a new color family).
export const editorialDark: Theme = {
  name: "editorial",
  mode: "dark",
  paper: "#1D1916",
  ink: "#EDE3D4",
  accent: "#C99A70",
  rule: "#4A3F35",
  muted: "#A28E78",
};
