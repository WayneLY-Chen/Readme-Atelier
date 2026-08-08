import { beforeAll, describe, expect, it } from "vitest";
import type { WidgetDefinition } from "./registry.js";
import { register } from "./registry.js";
import {
  formatConfigErrors,
  loadConfigOrDefault,
  parseConfig,
  type ResolvedConfig,
} from "./config.js";

function fakeWidget(name: string): WidgetDefinition<unknown> {
  return {
    name,
    requires: [],
    size: { width: 495, height: 220 },
    optionsSchema: { parse: (v: unknown) => v },
    describe: () => ({ title: "t", desc: "d" }),
    renderBody: () => "<g/>",
  };
}

// This module's registry is isolated per test file (vitest module isolation,
// vitest.config.ts default), so registering here does not leak into or
// depend on any other test file's registry state.
//
// "card" and "Card" are registered purely so the case-sensitivity test below
// can exercise the D-10 duplicate-id comparison via the type-derived default
// id path (`entry.id ?? entry.type`). Testing case-sensitivity through an
// explicit `id:` value is structurally impossible now: ID_PATTERN forces
// `id:` to be all-lowercase, so two explicit ids can never be "the same
// letters, different case" in the first place — the regex hardening closes
// off that scenario for real adopter input. The underlying duplicate-id Map
// comparison itself is still exact/case-sensitive by construction (a plain
// JS Map key lookup, no normalization step), and this is the only remaining
// way to observe that directly.
beforeAll(() => {
  register(fakeWidget("almanac"));
  register(fakeWidget("card"));
  register(fakeWidget("Card"));
});

describe("Plan 04 Task 2: parseConfig — D-12 error reporting", () => {
  it("reports an unknown card type with line/column, source line, underline, accepted values, and a did-you-mean suggestion", () => {
    const result = parseConfig("cards:\n  - type: almanc\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    const error = result.errors[0]!;
    expect(error.line).toBe(2);
    expect(error.sourceLine).toBe("  - type: almanc");
    expect(error.underline).toBeDefined();
    expect(error.underline!.includes("^")).toBe(true);
    expect(error.acceptedValues).toContain("almanac");
    expect(error.didYouMean).toBe("almanac");
    expect(error.message).toContain("almanc");
  });

  it("reports two duplicate ids ('a' twice) with a named message identifying the id and both card indices", () => {
    const result = parseConfig(
      "cards:\n  - type: almanac\n    id: a\n  - type: almanac\n    id: a\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const dupError = result.errors.find((e) => e.message.includes("重複的 id"));
    expect(dupError).toBeDefined();
    expect(dupError!.message).toContain('"a"');
    expect(dupError!.message).toContain("0");
    expect(dupError!.message).toContain("1");
  });

  it("does NOT treat 'card' and 'Card' as duplicate (type-derived default) ids — exact, case-sensitive comparison (D-10)", () => {
    const result = parseConfig("cards:\n  - type: card\n  - type: Card\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.cards.map((c) => c.type)).toEqual(["card", "Card"]);
  });

  it("rejects a path-traversal id ('../evil') and the message states the allowed character set, the offending value, and the line", () => {
    const result = parseConfig('cards:\n  - type: almanac\n    id: "../evil"\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    const error = result.errors[0]!;
    // Must name the allowed character set explicitly — not "Invalid id",
    // not a raw zod regex dump.
    expect(error.message).toContain("小寫");
    expect(error.message).toContain("數字");
    expect(error.message).toContain("連字號");
    // Must name the offending value.
    expect(error.message).toContain("../evil");
    // Must name the line (line 3: the `id:` line).
    expect(error.line).toBe(3);
    expect(error.message).toContain("3");
  });

  it("rejects an uppercase id ('My-Card') with the same charset+value+line standard, even though uppercase alone is traversal-safe", () => {
    const result = parseConfig("cards:\n  - type: almanac\n    id: My-Card\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.errors[0]!;
    expect(error.message).toContain("小寫");
    expect(error.message).toContain("My-Card");
    expect(error.line).toBe(3);
  });

  it("rejects a widgets.yml over the 1 MiB size guard before attempting to parse it (T-01-09 DoS defense)", () => {
    const oversized = "cards:\n" + "  - type: almanac\n".repeat(70_000); // well over 1_048_576 chars
    const result = parseConfig(oversized);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("過大");
  });

  it("accepts an existing, empty cards: [] array without error (distinct from a missing widgets.yml)", () => {
    const result = parseConfig("cards: []\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.cards).toEqual([]);
  });

  it("BOM-prefixed input and non-BOM input parse to identical successful results (UX-01/encoding)", () => {
    const withoutBom = parseConfig("cards: []\n");
    const withBom = parseConfig("﻿cards: []\n");
    expect(withBom).toEqual(withoutBom);
    expect(withBom.ok).toBe(true);
  });

  it("detects a Unicode replacement character (U+FFFD) and returns a named 'not UTF-8' error before attempting YAML parsing (UX-01/encoding)", () => {
    const result = parseConfig("theme: editorial\n�\ntimezone: UTC\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("UTF-8");
    expect(result.errors[0]!.message).toContain("U+FFFD");
  });

  it("rejects an unknown top-level key (a typo, 'langauge') via zod .strict() instead of silently stripping it (UX-01/encoding)", () => {
    const result = parseConfig(
      "theme: editorial\nlanguage: en\ntimezone: UTC\nlangauge: zh-TW\ncards: []\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const unknownKeyError = result.errors.find((e) => e.message.includes("langauge"));
    expect(unknownKeyError).toBeDefined();
  });

  it("reports every problem in one call — an unknown type AND a duplicate id together produce two errors, not one (D-12)", () => {
    const result = parseConfig(
      "cards:\n" +
        "  - type: almanc\n" +
        "    id: a\n" +
        "  - type: almanac\n" +
        "    id: a\n",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(2);
    expect(result.errors.some((e) => e.message.includes("almanc"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("重複的 id"))).toBe(true);
  });

  it("parses an equivalent CRLF-line-ending widgets.yml the same as its LF counterpart (regression)", () => {
    const lf = "theme: editorial\r\nlanguage: en\r\ntimezone: UTC\r\ncards:\r\n  - type: almanac\r\n";
    const result = parseConfig(lf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config).toEqual<ResolvedConfig>({
      theme: "editorial",
      language: "en",
      timezone: "UTC",
      cards: [{ type: "almanac" }],
    });
  });

  it("formatConfigErrors renders a header, location, quoted+underlined source line, and message for each error", () => {
    const result = parseConfig("cards:\n  - type: almanc\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = formatConfigErrors(result.errors);
    expect(text).toContain("widgets.yml 設定有誤");
    expect(text).toContain("widgets.yml:2:");
    expect(text).toContain("almanc");
    expect(text).toContain("^");
  });
});

describe("Plan 04 Task 2: theme enum — D-06/D-07/THEME-04 (four-theme catalog)", () => {
  it.each(["dracula", "nord", "tokyonight"] as const)(
    "accepts theme: %s",
    (themeName) => {
      const result = parseConfig(`theme: ${themeName}\n`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.config.theme).toBe(themeName);
    },
  );

  it("rejects a typo'd theme value ('draluca') with a did-you-mean suggestion of 'dracula' and exactly 4 accepted values (THEME-04: capped, not open)", () => {
    const result = parseConfig("theme: draluca\n");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.errors.find((e) => e.acceptedValues !== undefined);
    expect(error).toBeDefined();
    expect(error!.acceptedValues).toEqual(
      expect.arrayContaining(["editorial", "dracula", "nord", "tokyonight"]),
    );
    expect(error!.acceptedValues).toHaveLength(4);
    expect(error!.didYouMean).toBe("dracula");
  });
});

describe("Plan 04 Task 2: loadConfigOrDefault — D-11", () => {
  it("returns the built-in default config and a complete, copy-pasteable equivalent YAML when the file is absent (yamlText === undefined)", () => {
    const { config, usedDefault, equivalentYaml } = loadConfigOrDefault(undefined);
    expect(usedDefault).toBe(true);
    expect(config).toEqual<ResolvedConfig>({
      theme: "editorial",
      language: "en",
      timezone: "UTC",
      cards: [{ type: "almanac" }],
    });
    // The dumped YAML must itself parse back to the exact same config —
    // proves it's generated from the same object, not a hand-written
    // string literal that could drift from it.
    const reparsed = parseConfig(equivalentYaml);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.config).toEqual(config);
  });

  it("treats an empty string as real (degenerate) file content, not as 'file absent' — usedDefault is false", () => {
    const { config, usedDefault } = loadConfigOrDefault("");
    expect(usedDefault).toBe(false);
    expect(config).toEqual<ResolvedConfig>({
      theme: "editorial",
      language: "en",
      timezone: "UTC",
      cards: [{ type: "almanac" }],
    });
  });

  it("throws ConfigValidationError (not a silent fallback to defaults) when real file content fails validation", () => {
    expect(() => loadConfigOrDefault("cards:\n  - type: almanc\n")).toThrow();
  });
});
