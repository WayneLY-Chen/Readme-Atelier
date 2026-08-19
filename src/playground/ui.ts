/**
 * Small, framework-free DOM helpers shared by `main.ts` — the playground has
 * no component library (05-UI-SPEC.md's Design System table: "none", hand
 * written helpers, matching the cards' own no-component-library convention).
 * Everything here is generic enough to be reused across all three Adoption
 * Kit panels and the copy-feedback contract; nothing card-specific lives
 * here.
 */

/**
 * Selects the full text content of `el` via the Selection/Range API — the
 * Clipboard-API-failure fallback the UI-SPEC's copy-feedback contract
 * requires: "the failure auto-selects the panel's content as a fallback,
 * not just an apology." Also used as the Clipboard API's own *success* path
 * has no need for this; only the failure path calls it.
 */
export function selectAllText(el: HTMLElement): void {
  const selection = window.getSelection();
  if (selection === null) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

export interface CopyArtifactOptions {
  /** The text to place on the clipboard — read fresh at call time, not cached. */
  getText: () => string;
  /** The button the visitor clicked; its label/class are what changes. */
  button: HTMLButtonElement;
  /** The `<pre>`/`<code>` element to auto-select on failure. */
  target: HTMLElement;
  /** The shared status/live-announcement region (one for the whole page). */
  statusRegion: HTMLElement;
  /** Human-readable name used in status announcements, e.g. "workflow YAML". */
  label: string;
}

const COPY_DEFAULT_LABEL = "Copy";
const COPY_FEEDBACK_MS = 2000;

/**
 * The copy-feedback contract (05-UI-SPEC.md "複製回饋契約"), implemented
 * once and reused by all three Adoption Kit panels:
 *  - success: button text -> "Copied!" for 2s, a short `accent` pulse via
 *    the `is-copy-success` CSS class, shared status region announces it
 *  - failure: button text -> "Copy failed — select below", `is-copy-fail`
 *    class, shared status region announces it, AND the code block's full
 *    text is auto-selected (Selection/Range API) so the visitor can still
 *    copy manually with Ctrl/Cmd+C — never just an apology string.
 */
export async function copyArtifact(opts: CopyArtifactOptions): Promise<void> {
  const { getText, button, target, statusRegion, label } = opts;
  try {
    await navigator.clipboard.writeText(getText());
    button.textContent = "Copied!";
    button.classList.remove("is-copy-fail");
    button.classList.add("is-copy-success");
    statusRegion.textContent = `Copied ${label} to clipboard.`;
  } catch {
    button.textContent = "Copy failed — select below";
    button.classList.remove("is-copy-success");
    button.classList.add("is-copy-fail");
    statusRegion.textContent = `Couldn't copy ${label} automatically — its text is now selected for manual copying.`;
    selectAllText(target);
  }
  window.setTimeout(() => {
    button.textContent = COPY_DEFAULT_LABEL;
    button.classList.remove("is-copy-success", "is-copy-fail");
  }, COPY_FEEDBACK_MS);
}

/**
 * Sets `aria-pressed`/`is-selected` on exactly the button whose
 * `data-value` matches `activeValue`, clearing every sibling — the shared
 * implementation behind Card/Theme/Language/Card-Appearance's independent
 * `<button aria-pressed>` groups (05-UI-SPEC.md contract 7: deliberately
 * NOT a `tablist`/`radiogroup`).
 */
export function setActiveButton(buttons: NodeListOf<HTMLButtonElement> | HTMLButtonElement[], activeValue: string): void {
  for (const button of buttons) {
    const isActive = button.dataset.value === activeValue;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.classList.toggle("is-selected", isActive);
  }
}

/** Enables/disables every button and select inside `container` (zh-TW font loading gate). */
export function setGroupDisabled(container: HTMLElement, disabled: boolean): void {
  container.querySelectorAll("button, select").forEach((el) => {
    (el as HTMLButtonElement | HTMLSelectElement).disabled = disabled;
  });
  container.setAttribute("aria-busy", disabled ? "true" : "false");
}
