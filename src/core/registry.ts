import type { DataCapability, ProfileData, Theme, WidgetSize } from "./model.js";

/**
 * Structural equivalent of the subset of zod's `ZodType` API this project
 * actually calls (`.parse()`). Deviation from the plan text (recorded in
 * SUMMARY.md): the plan describes this field's type as `z.ZodType<Opts>` via
 * `import type { z } from "zod"`, but `zod` is not installed until Plan 04 —
 * even a type-only import from an uninstalled package fails
 * `npx tsc --noEmit` (no ambient declarations to resolve). A real zod schema
 * already satisfies this interface structurally (it has `.parse()`), so
 * swapping the interim hand-written optionsSchema objects for real
 * `z.ZodType<Opts>` instances in Plan 04 requires no change to this type.
 */
export interface OptionsSchema<Opts> {
  parse(value: unknown): Opts;
}

export interface WidgetDefinition<Opts = unknown> {
  /** Registry key; must match the `type:` value a consumer writes in widgets.yml. */
  readonly name: string;

  /** Declares the slice of ProfileData this widget needs. */
  readonly requires: readonly DataCapability[];

  /** Static, not computed at render time. */
  readonly size: WidgetSize;

  /** Validates AND supplies defaults for this widget's block of widgets.yml. */
  readonly optionsSchema: OptionsSchema<Opts>;

  /** Accessibility metadata for the <title>/<desc> elements the core owns. */
  describe(data: ProfileData, opts: Opts): { title: string; desc: string };

  /** Returns ONLY the inner markup — not a full <svg> root (see core/svg.ts). */
  renderBody(data: ProfileData, theme: Theme, opts: Opts): string;
}

export class DuplicateWidgetError extends Error {
  constructor(name: string) {
    super(`DuplicateWidgetError: a widget named "${name}" is already registered.`);
    this.name = "DuplicateWidgetError";
  }
}

const widgets = new Map<string, WidgetDefinition<any>>();

/**
 * Register `widget`. Throws DuplicateWidgetError (never silently overwrites)
 * if a widget with the same name is already registered.
 */
export function register(widget: WidgetDefinition<any>): void {
  if (widgets.has(widget.name)) {
    throw new DuplicateWidgetError(widget.name);
  }
  widgets.set(widget.name, widget);
}

export function get(name: string): WidgetDefinition<any> | undefined {
  return widgets.get(name);
}

/**
 * Union the `requires` arrays of every enabled widget into one
 * Set<DataCapability>, driving the single shared GraphQL fetch.
 */
export function collectCapabilities(enabled: WidgetDefinition<any>[]): Set<DataCapability> {
  const capabilities = new Set<DataCapability>();
  for (const widget of enabled) {
    for (const capability of widget.requires) {
      capabilities.add(capability);
    }
  }
  return capabilities;
}
