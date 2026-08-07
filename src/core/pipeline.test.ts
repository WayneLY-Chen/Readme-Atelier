import { beforeAll, describe, expect, it } from "vitest";
import type { ResolvedConfig } from "./config.js";
import {
  InvalidCardOptionsError,
  renderAllCards,
  UnknownWidgetError,
} from "./pipeline.js";
import { get, register } from "./registry.js";
import { loadAllFonts } from "../node/fonts.js";
import { almanacWidget } from "../widgets/almanac/index.js";

const NOW = new Date("2026-08-07T12:00:00Z");
const GLOBAL_OPTS = { now: NOW, seed: 0 };

function config(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    theme: "editorial",
    language: "en",
    timezone: "UTC",
    cards: [{ type: "almanac" }],
    ...overrides,
  };
}

beforeAll(() => {
  loadAllFonts();
  // The registry is a module-level Map and `register` throws on a duplicate,
  // so guard: another test file in the same worker may have registered first.
  if (!get("almanac")) {
    register(almanacWidget);
  }
});

describe("renderAllCards", () => {
  it("renders one light/dark pair per card entry, in written order", () => {
    const cards = renderAllCards(
      config({ cards: [{ type: "almanac" }, { type: "almanac", id: "almanac-utc" }] }),
      GLOBAL_OPTS,
    );

    expect(cards.map((c) => c.id)).toEqual(["almanac", "almanac-utc"]);
    for (const card of cards) {
      expect(card.light).toContain("<svg");
      expect(card.dark).toContain("<svg");
      // The sandbox-safety invariant the whole phase rests on (RENDER-01).
      expect(card.light).not.toContain("<text");
      expect(card.dark).not.toContain("<text");
    }
  });

  it("defaults id to type, and uses an explicit id when given (D-10)", () => {
    expect(renderAllCards(config(), GLOBAL_OPTS)[0].id).toBe("almanac");
    expect(
      renderAllCards(config({ cards: [{ type: "almanac", id: "my-card" }] }), GLOBAL_OPTS)[0].id,
    ).toBe("my-card");
  });

  it("throws UnknownWidgetError for a type with no registered widget", () => {
    expect(() => renderAllCards(config({ cards: [{ type: "nope" }] }), GLOBAL_OPTS)).toThrow(
      UnknownWidgetError,
    );
  });

  /**
   * The regression guard for `almanacOptionsSchema`'s `.strict()`. Without it
   * this typo is silently ignored: the card renders in the top-level timezone
   * and the adopter never learns their override did nothing. `core/config.ts`
   * cannot catch this — it types `options:` as an open record, because only
   * the widget knows its own option vocabulary.
   */
  it("rejects an unrecognized option key instead of ignoring it, and names it", () => {
    let caught: unknown;
    try {
      renderAllCards(
        config({ cards: [{ type: "almanac", options: { timezon: "Asia/Taipei" } }] }),
        GLOBAL_OPTS,
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(InvalidCardOptionsError);
    const message = (caught as Error).message;
    // Must name the offending card AND the offending key — a widgets.yml with
    // several cards produces several options blocks.
    expect(message).toContain("almanac");
    expect(message).toContain("timezon");
    // Must not leak zod's internal vocabulary into an adopter's terminal.
    expect(message).not.toContain("(root)");
    expect(message).not.toContain("Unrecognized key");
  });

  /**
   * D-08 is a prohibition, not just a default: `language` is read from the top
   * level only. Enforcing it by REJECTION rather than by silently dropping the
   * key is the whole point — a dropped key renders the wrong language with no
   * visible cause.
   */
  it("rejects a card-level language override (D-08)", () => {
    expect(() =>
      renderAllCards(
        config({ cards: [{ type: "almanac", options: { language: "zh-TW" } }] }),
        GLOBAL_OPTS,
      ),
    ).toThrow(InvalidCardOptionsError);
  });

  it("honors a per-card timezone override while language stays top-level (D-09)", () => {
    const [utc, taipei] = renderAllCards(
      config({
        timezone: "UTC",
        cards: [
          { type: "almanac", id: "a-utc" },
          { type: "almanac", id: "a-tpe", options: { timezone: "Asia/Taipei" } },
        ],
      }),
      // A moment where UTC and Asia/Taipei fall on different calendar dates,
      // so an ignored override would produce identical output and fail here.
      { now: new Date("2026-08-07T20:00:00Z"), seed: 0 },
    );

    expect(utc.light).not.toBe(taipei.light);
  });

  it("is deterministic: same config and same now produce byte-identical output", () => {
    const a = renderAllCards(config(), GLOBAL_OPTS);
    const b = renderAllCards(config(), GLOBAL_OPTS);
    expect(a[0].light).toBe(b[0].light);
    expect(a[0].dark).toBe(b[0].dark);
  });
});
