import type { DataCapability, ProfileData } from "./model.js";

/**
 * Compose the GraphQL query text needed to satisfy the union of every
 * enabled widget's declared capabilities. Returns null for the zero-
 * capability case (DATA-03: Almanac needs no fetch at all).
 */
export function buildQuery(capabilities: Set<DataCapability>): string | null {
  if (capabilities.size === 0) {
    return null;
  }
  // Capability-to-fragment composition is Phase 2 scope (DATA-01/DATA-02).
  throw new Error("not implemented until Phase 2");
}

/**
 * Fetch profile data sufficient to satisfy `capabilities`. When the set is
 * empty this returns a placeholder ProfileData immediately, without
 * constructing or issuing any HTTP request — this is the concrete DATA-03
 * boundary: the zero-capability path never touches the network.
 */
export async function fetchProfileData(
  capabilities: Set<DataCapability>,
  token: string,
): Promise<ProfileData> {
  if (capabilities.size === 0) {
    return {
      login: "",
      name: null,
      avatarUrl: "",
      followers: 0,
      fetchedAt: new Date(0).toISOString(),
      stats: { totalCommits: 0, totalPRs: 0, totalIssues: 0, totalStars: 0 },
    };
  }
  // Non-empty-capability fetching is Phase 2 scope (DATA-01/DATA-02).
  throw new Error("not implemented until Phase 2");
}
