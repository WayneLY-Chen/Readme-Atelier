import { afterEach, describe, expect, it, vi } from "vitest";
import { logPointCost } from "./point-cost.js";

describe("logPointCost", () => {
  afterEach(() => {
    delete process.env.GITHUB_STEP_SUMMARY;
  });

  it("calls both info and summary deps exactly once each, both containing the cost value", () => {
    const info = vi.fn();
    const summary = vi.fn();

    logPointCost(42, { info, summary });

    expect(info).toHaveBeenCalledTimes(1);
    expect(summary).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toContain("42");
    expect(summary.mock.calls[0]?.[0]).toContain("42");
  });

  it("does not throw when called without deps and GITHUB_STEP_SUMMARY is unset (real core.info + writeStepSummary defaults)", () => {
    delete process.env.GITHUB_STEP_SUMMARY;
    expect(() => logPointCost(42)).not.toThrow();
  });
});
