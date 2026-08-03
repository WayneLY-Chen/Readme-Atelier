// Ambient type declarations for third-party packages that ship no TypeScript
// types of their own (verified via `find node_modules/<pkg> -iname "*.d.ts"`
// during Phase 1 Plan 1 execution — none exist for these three packages, and
// installing the mismatched-version @types/opentype.js (pinned at 1.3.10
// against our opentype.js@2.0.0 runtime) was judged riskier than a small,
// exactly-scoped local declaration covering only the API surface this repo
// actually calls).

declare module "opentype.js" {
  // opentype.js@2.0.0 ships a UMD bundle with no "exports" map in
  // package.json; Node's CJS/ESM interop (cjs-module-lexer) cannot
  // statically detect named exports from its factory-return pattern, so at
  // runtime `import { parse } from "opentype.js"` fails with "does not
  // provide an export named 'parse'" — confirmed empirically via
  // `node -e "import('opentype.js').then(m => console.log(Object.keys(m)))"`
  // which prints only `['default', 'module.exports']`. Only the default
  // import actually works; everything (parse, Font, Path, ...) hangs off it.
  export interface PathCommand {
    type: string;
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }

  export class Path {
    commands: PathCommand[];
    toPathData(decimalPlaces?: number): string;
  }

  export class Font {
    numGlyphs: number;
    getAdvanceWidth(text: string, fontSize: number): number;
    getPath(text: string, x: number, y: number, fontSize: number): Path;
  }

  interface OpentypeModule {
    parse(buffer: ArrayBuffer | Buffer): Font;
    Font: typeof Font;
    Path: typeof Path;
  }

  const opentype: OpentypeModule;
  export default opentype;
}

declare module "subset-font" {
  export interface SubsetFontOptions {
    targetFormat: "sfnt" | "woff" | "woff2" | "truetype";
    preserveNameIds?: number[];
    variationAxes?: Record<string, unknown>;
    noLayoutClosure?: boolean;
  }

  export default function subsetFont(
    buffer: Buffer | ArrayBuffer | Uint8Array,
    text: string,
    options: SubsetFontOptions,
  ): Promise<Buffer>;
}

declare module "fontverter" {
  export type FontFormat = "sfnt" | "woff" | "woff2" | "truetype";

  export function convert(
    buffer: Buffer | ArrayBuffer | Uint8Array,
    toFormat: FontFormat,
    fromFormat?: FontFormat,
  ): Promise<Buffer>;

  export function detectFormat(buffer: Buffer | ArrayBuffer | Uint8Array): FontFormat;
}
