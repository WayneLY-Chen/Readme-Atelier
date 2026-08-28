/**
 * Thrown by assertSlotBudget when a formatted string's measured render width
 * exceeds its slot's budget. Names all four load-bearing facts — field,
 * formatted string, measured width, budget — never just "too long" (mirrors
 * src/core/svg.ts's SizeBudgetError / the-record/format.ts's
 * RecordSlotOverflowError convention).
 */
export class VitalsSlotOverflowError extends Error {
  constructor(field: string, formatted: string, widthPx: number, budgetPx: number) {
    super(
      `VitalsSlotOverflowError: field "${field}" formatted as "${formatted}" measures ` +
        `${widthPx}px, exceeding the ${budgetPx}px slot budget.`,
    );
    this.name = "VitalsSlotOverflowError";
  }
}

/**
 * Per-render slot-width backstop (06-UI-SPEC.md "Text slot budgets" —
 * Vitals table). Every one of Vitals' seven text slots is engine-authored,
 * so RENDER-05's fail-loud policy applies in full (Phase 3's
 * truncate-with-ellipsis policy for API-sourced text does NOT apply to this
 * card). Called before the corresponding path data is built, so an
 * out-of-budget string fails the build loudly instead of silently
 * overflowing the rendered card. Shape copied from the-record/format.ts's
 * assertSlotBudget (RENDER-02: no widget imports another widget's private
 * helper).
 */
export function assertSlotBudget(field: string, formatted: string, widthPx: number, budgetPx: number): void {
  if (widthPx > budgetPx) {
    throw new VitalsSlotOverflowError(field, formatted, widthPx, budgetPx);
  }
}

/**
 * `DAILY MEAN` formatting (06-UI-SPEC.md "Stat row" table): round to one
 * decimal place and ALWAYS print the decimal place — `12.0`, never `12`.
 * This is deliberately a DIFFERENT format from the project's shipped
 * compact-number logic (editorial-stat-card/format.ts's `formatStatNumber`,
 * the-record/format.ts's `formatRecordNumber`, both of which switch to a
 * 萬/億-suffixed compact form above 10000) — a daily mean over a 28-day
 * window can never reach that range, and this function must NOT import or
 * duplicate that compaction logic (06-UI-SPEC.md Watch Item B: this is
 * explicitly NOT counted as a fourth copy of the 萬/億 format).
 */
export function formatDailyMean(mean: number): string {
  const rounded = Math.round(mean * 10) / 10;
  return rounded.toFixed(1);
}
