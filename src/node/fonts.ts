import { readFileSync } from "node:fs";
import { registerFont } from "../core/font.js";

/**
 * Node-only font loader. This file is deliberately outside src/core and
 * src/widgets — those two directories must never import fs/path/process (see
 * 01-CONTEXT.md's <code_context>, kept so Phase 5's browser playground can
 * reuse core/widgets source unchanged). This is the one place that actually
 * touches disk to hand raw bytes to core/font.ts's registerFont().
 */
export function loadAllFonts(): void {
  const regularBuffer = readFileSync("assets/fonts/ibm-plex-mono-regular.subset.ttf");
  registerFont(
    "mono-regular",
    regularBuffer.buffer.slice(
      regularBuffer.byteOffset,
      regularBuffer.byteOffset + regularBuffer.byteLength,
    ) as ArrayBuffer,
  );

  const semiboldBuffer = readFileSync("assets/fonts/ibm-plex-mono-semibold.subset.ttf");
  registerFont(
    "mono-semibold",
    semiboldBuffer.buffer.slice(
      semiboldBuffer.byteOffset,
      semiboldBuffer.byteOffset + semiboldBuffer.byteLength,
    ) as ArrayBuffer,
  );
}
