/**
 * Resolves whose GitHub profile `fetchProfileData` should query for this run
 * (GAP-05-01).
 *
 * T-01-11 boundary note (the full context lives in `action-entry.ts`'s own
 * comment above where this is called): this function has NOTHING to do with
 * where rendered cards get PUBLISHED. That target is derived exclusively
 * from `GITHUB_REPOSITORY` inside `action-entry.ts` and is never
 * overridable by any input — T-01-11's "force-push targets the wrong repo"
 * mitigation is completely untouched by this file. This function answers a
 * genuinely different question: whose profile does the FETCH query? On a
 * personal repository those two answers happen to coincide (the repo owner
 * IS the profile owner), but on an organization-owned repository they
 * diverge — `GITHUB_REPOSITORY`'s owner segment is the Organization, and
 * GitHub's GraphQL `user(login: $login)` can only resolve a User, never an
 * Organization. The optional `profile-login` Action input lets an adopter
 * name the real user explicitly; omitting it preserves today's exact
 * behavior (fall back to the repo owner) for every existing workflow file.
 */
export interface ResolvedProfileLogin {
  /** The login to pass as `fetchProfileData`'s `login` argument. */
  login: string;
  /**
   * True when no explicit `profile-login` input was supplied, so `login` is
   * just `repoOwner` verbatim. This is deliberately NOT the same flag as
   * "safe to override" — it exists purely so a downstream fetch-failure
   * formatter can decide whether org-repo guidance is relevant (an adopter
   * who set `profile-login` on purpose already made their choice; a
   * different failure for an explicitly-configured login should not be
   * second-guessed with unrelated advice).
   */
  wasInferredFromRepoOwner: boolean;
}

/**
 * `profileLoginInput` is expected to already be the raw
 * `core.getInput("profile-login")` return value — empty string when the
 * input was not supplied, matching every other optional input in this
 * project's Action manifest. This function itself never touches
 * `@actions/core`/`process.env`/`fs`, keeping it a plain, hermetically
 * testable string function with no I/O.
 */
export function resolveProfileLogin(profileLoginInput: string, repoOwner: string): ResolvedProfileLogin {
  const trimmed = profileLoginInput.trim();
  if (trimmed.length > 0) {
    return { login: trimmed, wasInferredFromRepoOwner: false };
  }
  return { login: repoOwner, wasInferredFromRepoOwner: true };
}
