import { parseDocument } from "yaml";
import { describe, expect, it } from "vitest";
import { buildEmbedSnippet } from "../core/embed-snippet.js";
import { parseConfig } from "../core/config.js";
import type { RenderedCard } from "../core/pipeline.js";
import { registerAllWidgets } from "../widgets/all.js";
import { buildAdopterWorkflowYaml, buildEmbedSnippetsArtifact, buildWidgetsYamlArtifact } from "./artifacts.js";

// parseConfig's semantic check (core/config.ts) validates each card `type:`
// against the real widget registry, so the round-trip assertions below need
// the five built-in widgets actually registered — exactly what the
// playground's own composition root (main.ts) does before ever calling
// these artifact builders. Called once at module scope: `register()` throws
// `DuplicateWidgetError` on a second call, and Vitest isolates module state
// per test file, so this runs exactly once for this file.
registerAllWidgets();

const ALL_CARD_TYPES = ["almanac", "editorial-stat-card", "the-graveyard", "the-record", "masthead"];

function fakeCard(id: string): RenderedCard {
  return {
    id,
    light: `<svg id="${id}-light"></svg>`,
    dark: `<svg id="${id}-dark"></svg>`,
    title: `${id} title`,
    desc: `${id} description`,
  };
}

describe("buildAdopterWorkflowYaml — 產物①（DIST-03/D-08 的採用者範本）", () => {
  it("contains the default 6-hour cron", () => {
    expect(buildAdopterWorkflowYaml()).toContain('cron: "0 */6 * * *"');
  });

  it("contains workflow_dispatch", () => {
    expect(buildAdopterWorkflowYaml()).toContain("workflow_dispatch:");
  });

  it("contains permissions: contents: write", () => {
    expect(buildAdopterWorkflowYaml()).toContain("contents: write");
  });

  it("contains the full uses: line pinned to @v1, matching render.yml's own published contract", () => {
    expect(buildAdopterWorkflowYaml()).toContain(
      "uses: WayneLY-Chen/Readme-Atelier/.github/workflows/render.yml@v1",
    );
  });

  it("is valid, parseable YAML", () => {
    const doc = parseDocument(buildAdopterWorkflowYaml());
    expect(doc.errors).toEqual([]);
  });
});

describe("buildWidgetsYamlArtifact — 產物②（往返過 parseConfig 保證合法）", () => {
  it("round-trips through parseConfig with zero cards (checklist empty state, config.ts:90 allows this)", () => {
    const yaml = buildWidgetsYamlArtifact({ cards: [], theme: "editorial" });
    const result = parseConfig(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.cards).toEqual([]);
    }
  });

  it("round-trips through parseConfig with all five cards, preserving checklist order", () => {
    const yaml = buildWidgetsYamlArtifact({ cards: ALL_CARD_TYPES, theme: "editorial" });
    const result = parseConfig(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.cards.map((c) => c.type)).toEqual(ALL_CARD_TYPES);
    }
  });

  it("round-trips a partial selection (1-4 cards) and preserves order", () => {
    const partial = ["the-graveyard", "masthead"];
    const yaml = buildWidgetsYamlArtifact({ cards: partial, theme: "dracula" });
    const result = parseConfig(yaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.cards.map((c) => c.type)).toEqual(partial);
      expect(result.config.theme).toBe("dracula");
    }
  });

  it.each(["editorial", "dracula", "nord", "tokyonight"] as const)(
    "carries the theme value %s through to the serialized YAML",
    (theme) => {
      const yaml = buildWidgetsYamlArtifact({ cards: ["almanac"], theme });
      const result = parseConfig(yaml);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.config.theme).toBe(theme);
      }
    },
  );
});

describe("buildEmbedSnippetsArtifact — 產物③（D-03：與 buildEmbedSnippet() 逐位元組相等）", () => {
  it("matches buildEmbedSnippet() byte-for-byte for a single card, username=octocat", () => {
    const card = fakeCard("almanac");
    const artifact = buildEmbedSnippetsArtifact({ username: "octocat", cards: [card] });
    const expected = buildEmbedSnippet({
      id: card.id,
      title: card.title,
      desc: card.desc,
      owner: "octocat",
      repo: "octocat",
    });
    expect(artifact).toBe(expected);
  });

  it("matches buildEmbedSnippet() byte-for-byte for every one of the five widgets", () => {
    const cards = ALL_CARD_TYPES.map(fakeCard);
    const artifact = buildEmbedSnippetsArtifact({ username: "octocat", cards });
    const expectedPieces = cards.map((card) =>
      buildEmbedSnippet({
        id: card.id,
        title: card.title,
        desc: card.desc,
        owner: "octocat",
        repo: "octocat",
      }),
    );
    expect(artifact).toBe(expectedPieces.join("\n"));
  });

  it("URL-encodes a username with URL-dangerous characters, matching buildEmbedSnippet()'s own encodeURIComponent behavior", () => {
    const card = fakeCard("the-record");
    const dangerousUsername = "weird user/name";
    const artifact = buildEmbedSnippetsArtifact({ username: dangerousUsername, cards: [card] });
    const expected = buildEmbedSnippet({
      id: card.id,
      title: card.title,
      desc: card.desc,
      owner: dangerousUsername,
      repo: dangerousUsername,
    });
    expect(artifact).toBe(expected);
    expect(artifact).not.toContain("weird user/name");
  });

  it("returns an empty string for zero rendered cards", () => {
    expect(buildEmbedSnippetsArtifact({ username: "octocat", cards: [] })).toBe("");
  });
});
