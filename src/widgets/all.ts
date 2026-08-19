import { register } from "../core/registry.js";
import { almanacWidget } from "./almanac/index.js";
import { editorialStatCardWidget } from "./editorial-stat-card/index.js";
import { mastheadWidget } from "./masthead/index.js";
import { theGraveyardWidget } from "./the-graveyard/index.js";
import { theRecordWidget } from "./the-record/index.js";

/**
 * The ONE registration list for every built-in widget (QA-03 / D-12). Before
 * this file existed, the same five `register(...)` calls were hand-copied
 * into three separate composition roots (`src/action-entry.ts`,
 * `src/cli.ts`, `scripts/build-uat-preview.ts`) — a fourth copy was about to
 * be added for the Phase 5 playground entry point. Adding a sixth card now
 * costs exactly two changes: a new `src/widgets/<name>/` directory, and one
 * new line here. No entry point, and no file under `src/core/`, needs to
 * change.
 *
 * `register()` throws `DuplicateWidgetError` (src/core/registry.ts) if a name
 * is already registered — it never silently overwrites. Because of that,
 * `registerAllWidgets()` itself must be called exactly ONCE per process: a
 * composition root that calls it twice (e.g. once at module load and again
 * inside a hot-reload/re-render loop) will throw on the second call.
 */
export function registerAllWidgets(): void {
  register(almanacWidget);
  register(editorialStatCardWidget);
  register(mastheadWidget);
  register(theGraveyardWidget);
  register(theRecordWidget);
}
