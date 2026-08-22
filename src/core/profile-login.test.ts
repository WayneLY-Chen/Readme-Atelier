import { describe, expect, it } from "vitest";
import { resolveProfileLogin } from "./profile-login.js";

describe("resolveProfileLogin — GAP-05-01", () => {
  it("falls back to repoOwner when no profile-login input was supplied (empty string, matching action.getInput()'s un-set-input convention)", () => {
    const result = resolveProfileLogin("", "Wayne911022");
    expect(result).toEqual({ login: "Wayne911022", wasInferredFromRepoOwner: true });
  });

  it("uses the explicit input when supplied, ignoring repoOwner entirely — an org repo's real fix", () => {
    const result = resolveProfileLogin("octocat", "SomeOrg");
    expect(result).toEqual({ login: "octocat", wasInferredFromRepoOwner: false });
  });

  it("treats a whitespace-only input the same as absent", () => {
    const result = resolveProfileLogin("   ", "SomeOrg");
    expect(result).toEqual({ login: "SomeOrg", wasInferredFromRepoOwner: true });
  });

  it("trims surrounding whitespace from an explicit value", () => {
    const result = resolveProfileLogin("  octocat  ", "SomeOrg");
    expect(result).toEqual({ login: "octocat", wasInferredFromRepoOwner: false });
  });

  it("personal-repo default path: repoOwner passes straight through unchanged when omitted", () => {
    const result = resolveProfileLogin("", "octocat");
    expect(result.login).toBe("octocat");
  });
});
