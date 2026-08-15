import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      // QA-01 / RESEARCH.md Pitfall 3: Vitest 4 reports coverage only for
      // files a test actually imported. Without an explicit `include`, a
      // never-imported file is invisible in the report rather than shown at
      // 0% — which is exactly the failure mode that would hide the
      // never-tested files this requirement exists to find. Do not remove or
      // narrow this without re-reading that pitfall.
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/vendor.d.ts"],
      // `skipFull: false` is explicit, not the default: Vitest 4 auto-defaults
      // the text reporter to `skipFull: true` when it detects it's running
      // under a coding agent, silently dropping any file at 100% coverage on
      // every four metrics from the printed table. QA-01 needs every one of
      // the eight named files to actually appear in the table regardless of
      // who (human or agent) runs the command, so that default is overridden
      // here rather than left to vary by caller.
      reporter: [["text", { skipFull: false }], "html"],
    },
  },
});
