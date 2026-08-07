import { describe, expect, it } from "vitest";
import { AltTextEmptyError, buildAltText, buildEmbedSnippet } from "./embed-snippet.js";

const BASE = {
  id: "almanac",
  title: "Almanac card",
  desc: "Shows today's Gregorian date...",
  owner: "octocat",
  repo: "octocat",
};

describe("buildEmbedSnippet", () => {
  it("produces dark/light raw.githubusercontent.com URLs with a literal ?v=1", () => {
    const snippet = buildEmbedSnippet(BASE);

    expect(snippet).toContain(
      "https://raw.githubusercontent.com/octocat/octocat/output/almanac-dark.svg?v=1",
    );
    expect(snippet).toContain(
      "https://raw.githubusercontent.com/octocat/octocat/output/almanac-light.svg?v=1",
    );
  });

  it("puts the light URL in <img src>, the dark URL in <source srcset> (light is always fallback)", () => {
    const snippet = buildEmbedSnippet(BASE);

    const sourceIndex = snippet.indexOf("<source");
    const imgIndex = snippet.indexOf("<img");
    expect(sourceIndex).toBeGreaterThanOrEqual(0);
    expect(imgIndex).toBeGreaterThan(sourceIndex);

    const sourceTag = snippet.slice(sourceIndex, imgIndex);
    expect(sourceTag).toContain("almanac-dark.svg?v=1");
    expect(sourceTag).not.toContain("almanac-light.svg");

    const imgTag = snippet.slice(imgIndex);
    expect(imgTag).toContain('src="https://raw.githubusercontent.com/octocat/octocat/output/almanac-light.svg?v=1"');
  });

  it("builds a non-empty alt attribute from title + desc", () => {
    const snippet = buildEmbedSnippet(BASE);
    expect(snippet).toContain(`alt="Almanac card: Shows today's Gregorian date..."`);
  });

  it("throws AltTextEmptyError instead of returning a half-built snippet when title is empty", () => {
    expect(() => buildEmbedSnippet({ ...BASE, title: "" })).toThrow(AltTextEmptyError);
  });

  it("throws AltTextEmptyError when desc is empty", () => {
    expect(() => buildEmbedSnippet({ ...BASE, desc: "" })).toThrow(AltTextEmptyError);
  });

  it("escapes double quotes in title/desc so the alt attribute stays valid HTML", () => {
    const snippet = buildEmbedSnippet({
      ...BASE,
      title: 'Card "Special"',
      desc: 'Shows "quoted" content',
    });

    // The literal, un-escaped quote characters must never appear inside the
    // alt="..." attribute value — only the escaped &quot; form may.
    const altIndex = snippet.indexOf('alt="');
    const altValueStart = altIndex + 'alt="'.length;
    const altValueEnd = snippet.indexOf('"', altValueStart);
    const altValue = snippet.slice(altValueStart, altValueEnd);
    // Because the value itself contains &quot;, the naive indexOf('"', ...)
    // above would stop early at the FIRST escaped quote's literal `"`
    // character if escaping had failed. Assert on the full tag instead so a
    // regression that emits a raw `"` is caught even if it breaks the naive
    // parse above.
    const imgTagMatch = snippet.match(/<img[^>]*>/);
    expect(imgTagMatch).not.toBeNull();
    expect(imgTagMatch![0]).toContain("&quot;Special&quot;");
    expect(imgTagMatch![0]).toContain("&quot;quoted&quot;");
    // Exactly 4 literal double-quote characters should remain: the two pairs
    // delimiting src="..." and alt="...". A raw, unescaped `"` from the
    // title/desc would push this count above 4 and terminate the attribute
    // value early.
    const quoteCount = (imgTagMatch![0].match(/"/g) ?? []).length;
    expect(quoteCount).toBe(4);
  });
});

describe("buildAltText", () => {
  it("joins title and desc with a colon", () => {
    expect(buildAltText("Almanac card", "Shows the date")).toBe("Almanac card: Shows the date");
  });

  it("throws AltTextEmptyError for an empty title", () => {
    expect(() => buildAltText("", "desc")).toThrow(AltTextEmptyError);
  });

  it("throws AltTextEmptyError for an empty desc", () => {
    expect(() => buildAltText("title", "")).toThrow(AltTextEmptyError);
  });
});
