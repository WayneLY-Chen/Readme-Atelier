import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function headingCount(text: string): number {
  return text.split("\n").filter((line) => line.startsWith("## ")).length;
}

/**
 * Structural gate for Phase 5's bilingual documentation flip (D-09/D-10,
 * UX-07, QA-03, DIST-05, DIST-06). This file cannot verify prose quality or
 * translation fidelity - a reviewer has to read both READMEs for that - but
 * it can catch the class of drift that is cheap to introduce and expensive
 * to notice: a stale cross-link, a heading count that silently diverges
 * (one language grows a section the other never gets), a copy-pasted
 * adopter template that no longer matches the real render.yml contract, or
 * the pre-Phase-5 "delivered through GitHub's camo proxy" claim (Phase 4 UAT
 * established the real delivery path is raw.githubusercontent.com, not
 * camo) surviving into the new README text.
 *
 * Same style as src/action-manifest.test.ts: read the real file, grep for
 * identifying strings, fail with the offending detail in the message.
 */
describe("README.md / README.zh-TW.md — bilingual facade contract (UX-07, D-09)", () => {
  const en = read("README.md");
  const zh = read("README.zh-TW.md");

  it("both files exist and cross-link to each other's filename in their header", () => {
    expect(existsSync(path.join(repoRoot, "README.md"))).toBe(true);
    expect(existsSync(path.join(repoRoot, "README.zh-TW.md"))).toBe(true);
    expect(en).toContain("README.zh-TW.md");
    expect(zh).toContain("README.md");
  });

  it("cross-links point at the sibling file's top, not a Chinese-heading anchor (Pitfall 8)", () => {
    // A link like `README.zh-TW.md#some-anchor` or `README.md#anchor` would be
    // the fragile pattern this repo deliberately avoided - GitHub's anchor
    // slugs for CJK headings are percent-encoded and easy to break silently.
    expect(en).not.toMatch(/README\.zh-TW\.md#/);
    expect(zh).not.toMatch(/README\.md#/);
  });

  it("both carry the real adopter workflow contract: render.yml@v1, contents: write, the default cron, and workflow_dispatch", () => {
    for (const [name, text] of [
      ["README.md", en],
      ["README.zh-TW.md", zh],
    ] as const) {
      expect(text, `${name} missing render.yml@v1`).toContain("render.yml@v1");
      expect(text, `${name} missing contents: write`).toContain("contents: write");
      expect(text, `${name} missing the default 6-hour cron`).toContain("0 */6 * * *");
      expect(text, `${name} missing workflow_dispatch`).toContain("workflow_dispatch");
    }
  });

  it("both warn about the 60-day scheduled-workflow disablement and name raw.githubusercontent.com as the delivery path", () => {
    for (const [name, text] of [
      ["README.md", en],
      ["README.zh-TW.md", zh],
    ] as const) {
      expect(text, `${name} missing the 60-day warning`).toContain("60");
      expect(
        text.includes("disabled") || text.includes("停用"),
        `${name} missing a disabled/停用 signal word near the 60-day warning`,
      ).toBe(true);
      expect(text, `${name} missing raw.githubusercontent.com`).toContain("raw.githubusercontent.com");
    }
  });

  it("README.md no longer claims delivery goes through GitHub's camo proxy (Phase 4 UAT correction)", () => {
    // Verbatim offending strings this phase corrected, per 05-PATTERNS.md
    // "文件三件組": docs/README.en.md's old Notes section said cards were
    // "served through GitHub's camo cache", and the old root (zh) README said
    // delivery went "經 GitHub 的 camo 代理". Both were wrong - Phase 4's real
    // rendered-README UAT established raw.githubusercontent.com, which is a
    // GitHub-owned domain and is NOT proxied through camo.
    expect(en).not.toContain("served through GitHub's camo cache");
    expect(zh).not.toContain("經 GitHub 的 camo 代理");
  });

  it("has an equal number of ## sections in both languages (machine signal for structural parity)", () => {
    const enCount = headingCount(en);
    const zhCount = headingCount(zh);
    expect(
      enCount,
      `README.md has ${enCount} "## " sections but README.zh-TW.md has ${zhCount} - ` +
        "structure must stay mirrored (D-09: zh-TW is a peer, never an abridgement)",
    ).toBe(zhCount);
  });

  it("docs/README.en.md is a stub pointing at the root README (Pitfall 8 - inbound links must not 404)", () => {
    const stub = read("docs/README.en.md");
    const lineCount = stub.split("\n").length;
    expect(stub).toMatch(/\.\.\/README\.md/);
    expect(lineCount, `docs/README.en.md is ${lineCount} lines, expected a stub under 10`).toBeLessThan(10);
  });
});
