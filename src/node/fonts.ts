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

  const serifBuffer = readFileSync("assets/fonts/source-serif-4.subset.ttf");
  registerFont(
    "serif",
    serifBuffer.buffer.slice(
      serifBuffer.byteOffset,
      serifBuffer.byteOffset + serifBuffer.byteLength,
    ) as ArrayBuffer,
  );

  const notoTcBuffer = readFileSync("assets/fonts/noto-serif-tc.subset.ttf");
  registerFont(
    "noto-tc",
    notoTcBuffer.buffer.slice(
      notoTcBuffer.byteOffset,
      notoTcBuffer.byteOffset + notoTcBuffer.byteLength,
    ) as ArrayBuffer,
  );
}
