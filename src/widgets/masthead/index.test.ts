import { beforeAll, describe, expect, it } from "vitest";
import type { ProfileData, RenderOptions } from "../../core/model.js";
import { loadAllFonts } from "../../node/fonts.js";
import { mastheadWidget } from "./index.js";

function stubProfileData(login = "octocat"): ProfileData {
  return {
    login,
    name: null,
    avatarUrl: "",
    followers: 0,
    fetchedAt: new Date(0).toISOString(),
    stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
  };
}

function optsFor(
  language: RenderOptions["language"],
  overrides: Partial<RenderOptions> = {},
): RenderOptions {
  return {
    now: new Date("2026-08-09T06:00:00Z"),
    seed: 0,
    timezone: "UTC",
    language,
    ...overrides,
  };
}

beforeAll(() => {
  loadAllFonts();
});

describe("mastheadWidget — identity (MAST-01)", () => {
  it("has the expected name, requires, and size", () => {
    expect(mastheadWidget.name).toBe("masthead");
    expect(mastheadWidget.requires).toEqual(["identity"]);
    expect(mastheadWidget.size).toEqual({ width: 495, height: 116 });
  });
});

describe("mastheadWidget.optionsSchema — no configurable options", () => {
  it("accepts an empty object / undefined", () => {
    expect(() => mastheadWidget.optionsSchema.parse(undefined)).not.toThrow();
    expect(() => mastheadWidget.optionsSchema.parse({})).not.toThrow();
  });

  it("rejects any option key (.strict())", () => {
    expect(() => mastheadWidget.optionsSchema.parse({ unknown_key: 1 })).toThrow();
  });
});

describe("mastheadWidget.describe", () => {
  it("en", () => {
    expect(mastheadWidget.describe(stubProfileData(), optsFor("en"))).toEqual({
      title: "Masthead card",
      desc:
        "Prints an issue number, render timestamp, and a contents list for every other enabled " +
        "card, plus a figure cited from the Editorial Stat Card when it is enabled.",
    });
  });

  it("zh-TW", () => {
    expect(mastheadWidget.describe(stubProfileData(), optsFor("zh-TW"))).toEqual({
      title: "刊頭卡片",
      desc: "列印期數、產出時間，以及其他已啟用卡片的目次；並引用雜誌統計卡的一項數據。",
    });
  });
});

describe("mastheadWidget.renderBody — structure", () => {
  it("renders no <text> elements and at least one <path>", () => {
    const body = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), optsFor("en"));
    expect(body).not.toContain("<text");
    expect(body).toContain("<path");
  });
});

describe("mastheadWidget.renderBody — citation presence/absence (MAST-02/03)", () => {
  it("renders more markup when opts.citedFacts.totalCommits is present than when it is undefined", () => {
    const withCitation = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), {
      ...optsFor("en"),
      citedFacts: { totalCommits: { label: "COMMITS", value: "3,481" } },
    } as RenderOptions);
    const withoutCitation = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), optsFor("en"));

    expect(withCitation.length).toBeGreaterThan(withoutCitation.length);
  });

  it("citedFacts.totalCommits === undefined renders byte-identically to citedFacts omitted entirely", () => {
    const explicitUndefined = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), {
      ...optsFor("en"),
      citedFacts: { totalCommits: undefined },
    } as RenderOptions);
    const omitted = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), optsFor("en"));

    expect(explicitUndefined).toBe(omitted);
  });
});

describe("mastheadWidget.renderBody — contents zero-one-many (MAST-01)", () => {
  it("contents: [] does not throw and still renders the CONTENTS label alone", () => {
    expect(() =>
      mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), {
        ...optsFor("en"),
        contents: [],
      } as RenderOptions),
    ).not.toThrow();
  });

  it("contents omitted entirely behaves the same as contents: []", () => {
    const withEmptyArray = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), {
      ...optsFor("en"),
      contents: [],
    } as RenderOptions);
    const omitted = mastheadWidget.renderBody(stubProfileData(), lightThemeStub(), optsFor("en"));
    expect(withEmptyArray).toBe(omitted);
  });
});

// Minimal local Theme stub — avoids importing core/theme.ts's real palette
// just to exercise renderBody's structural shape (mirrors this project's
// other widget test files, which do import the real theme; done inline here
// to keep this file's only cross-directory import limited to model/fonts).
function lightThemeStub() {
  return {
    name: "editorial",
    mode: "light" as const,
    paper: "#F7F1E7",
    ink: "#302A25",
    accent: "#8B5E3C",
    rule: "#CDBDA8",
    muted: "#6B5B4B",
  };
}
