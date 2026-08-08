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

// 02-UI-SPEC.md "Theme Registry" table's dracula column — hex values copied
// verbatim from spec.draculatheme.com (the theme's own canonical source), not
// reinterpreted (THEME-03: adopters recognize the project as built for them).
// D-07: dracula is effectively dark-only in the ecosystem's own understanding
// of the name, so `mode` is honestly `'dark'` here — this is purely
// descriptive metadata, no render logic branches on it.
export const draculaTheme: Theme = {
  name: "dracula",
  mode: "dark",
  paper: "#282A36",
  ink: "#F8F8F2",
  accent: "#BD93F9",
  rule: "#44475A",
  muted: "#6272A4",
};

// 02-UI-SPEC.md "Theme Registry" table's nord column — hex values copied
// verbatim from nordtheme.com/docs/colors-and-palettes.
export const nordTheme: Theme = {
  name: "nord",
  mode: "dark",
  paper: "#2E3440",
  ink: "#ECEFF4",
  accent: "#88C0D0",
  rule: "#4C566A",
  muted: "#D8DEE9",
};

// 02-UI-SPEC.md "Theme Registry" table's tokyonight column — hex values
// copied verbatim from tokyonight.nvim's "night" variant source.
export const tokyonightTheme: Theme = {
  name: "tokyonight",
  mode: "dark",
  paper: "#1A1B26",
  ink: "#C0CAF5",
  accent: "#7AA2F7",
  rule: "#3B4261",
  muted: "#565F89",
};
