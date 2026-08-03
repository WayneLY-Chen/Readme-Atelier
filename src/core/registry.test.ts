import { describe, expect, it } from "vitest";
import { almanacWidget } from "../widgets/almanac/index.js";
import { collectCapabilities, DuplicateWidgetError, get, register } from "./registry.js";
import type { WidgetDefinition } from "./registry.js";
import type { DataCapability } from "./model.js";

function fakeWidget(
  name: string,
  requires: readonly DataCapability[] = [],
): WidgetDefinition<{ language: string }> {
  return {
    name,
    requires,
    size: { width: 100, height: 100 },
    optionsSchema: { parse: () => ({ language: "en" }) },
    describe: () => ({ title: "fake title", desc: "fake desc" }),
    renderBody: () => "<g/>",
  };
}

describe("core/registry", () => {
  it("register() then get() returns the exact same object reference", () => {
    const widget = fakeWidget("test-widget-a");
    register(widget);
    expect(get("test-widget-a")).toBe(widget);
  });

  it("get() returns undefined for a name that was never registered", () => {
    expect(get("does-not-exist")).toBeUndefined();
  });

  it("register() throws DuplicateWidgetError when the same name is registered twice", () => {
    const widget = fakeWidget("test-widget-b");
    register(widget);
    expect(() => register(fakeWidget("test-widget-b"))).toThrow(DuplicateWidgetError);
  });

  it("collectCapabilities([]) returns an empty Set", () => {
    expect(collectCapabilities([])).toEqual(new Set());
  });

  it("collectCapabilities unions requires across multiple widgets", () => {
    const a = fakeWidget("test-widget-c", ["stats"]);
    const b = fakeWidget("test-widget-d", ["stats", "calendar"]);
    expect(collectCapabilities([a, b])).toEqual(new Set(["stats", "calendar"]));
  });

  it("collectCapabilities([almanacWidget]) is an empty Set (DATA-03: zero API calls)", () => {
    expect(collectCapabilities([almanacWidget])).toEqual(new Set());
  });
});
