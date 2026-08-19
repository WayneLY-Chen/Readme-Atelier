import { buildAltText } from "../core/embed-snippet.js";
import type { ResolvedConfig } from "../core/config.js";
import { renderAllCards, resolveCards, resolveTheme } from "../core/pipeline.js";
import type { RenderedCard } from "../core/pipeline.js";
import { registerAllWidgets } from "../widgets/all.js";
import { buildAdopterWorkflowYaml, buildEmbedSnippetsArtifact, buildWidgetsYamlArtifact } from "./artifacts.js";
import { DEMO_PROFILE, NEW_ACCOUNT_PROFILE, PINNED_NOW, PINNED_SEED } from "./fixture.js";
import { ensureTcFont, loadLatinFonts, resetTcFontForRetry } from "./fonts.js";
import { copyArtifact, setActiveButton, setGroupDisabled } from "./ui.js";

/**
 * The playground's composition root — the THIRD entry point wired to the
 * exact same production pipeline `src/cli.ts` and `src/action-entry.ts` use
 * (RESEARCH.md Pattern 2: resolve -> fetch(skipped, D-02 fixture instead) ->
 * render). This file only ADDS to the minimal Task 2 tracer's composition
 * (05-03) — it never bypasses `renderAllCards()` with a parallel render path
 * (must_haves prohibition).
 *
 * `registerAllWidgets()` is called exactly once, at module load —
 * `register()` throws `DuplicateWidgetError` on a second call.
 */

/** D-05's fixed card checklist/config order — Almanac ... Masthead LAST. */
const CARD_ORDER = ["almanac", "editorial-stat-card", "the-graveyard", "the-record", "masthead"] as const;
type CardId = (typeof CARD_ORDER)[number];

const THEME_ORDER = ["editorial", "dracula", "nord", "tokyonight"] as const;
type ThemeName = (typeof THEME_ORDER)[number];

const USERNAME_PATTERN = /^[A-Za-z0-9-]{1,39}$/;

// ---- Mutable playground state -------------------------------------------
let previewCardId: CardId = "almanac";
let selectedTheme: ThemeName = "editorial";
let selectedLanguage: "en" | "zh-TW" = "en";
let selectedAppearance: "light" | "dark" = "light";
const checkedCardIds = new Set<CardId>(CARD_ORDER);
let username = "";
let useNewAccountFixture = false;
let fontState: "idle" | "loading" | "ready" | "failed" = "idle";
let renderedCards: RenderedCard[] = [];
let currentObjectUrl: string | undefined;

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) {
    throw new Error(`playground: missing #${id} in index.html`);
  }
  return el as T;
}

/**
 * Injects `svg` into `img` via a Blob object URL — never by writing markup
 * directly into the page's own DOM as a live `<svg>` element (UI-SPEC hard
 * constraint: only `<img alt>` reaches assistive tech; a live inlined SVG's
 * own `<title>` would leak into the accessibility tree, which the real
 * published embed never does). Revokes the previous object URL first so
 * repeated re-renders don't leak memory.
 */
function setCardImage(img: HTMLImageElement, svg: string, alt: string): void {
  if (currentObjectUrl !== undefined) {
    URL.revokeObjectURL(currentObjectUrl);
  }
  const blob = new Blob([svg], { type: "image/svg+xml" });
  currentObjectUrl = URL.createObjectURL(blob);
  img.src = currentObjectUrl;
  img.alt = alt;
}

function main(): void {
  const cardTabButtons = document.querySelectorAll<HTMLButtonElement>("#card-tabs .axis-btn");
  const cardSelect = requireEl<HTMLSelectElement>("card-select");
  const themeButtons = document.querySelectorAll<HTMLButtonElement>("#theme-buttons .axis-btn");
  const languageButtons = document.querySelectorAll<HTMLButtonElement>("#language-buttons .axis-btn");
  const appearanceButtons = document.querySelectorAll<HTMLButtonElement>("#appearance-buttons .axis-btn");
  const controls = requireEl<HTMLElement>("controls");
  const previewCanvas = requireEl<HTMLElement>("preview-canvas");
  const previewImg = requireEl<HTMLImageElement>("playground-card");
  const previewErrorPanel = requireEl<HTMLElement>("preview-error-panel");
  const newAccountToggle = requireEl<HTMLAnchorElement>("new-account-toggle");
  const zhFontError = requireEl<HTMLElement>("zh-font-error");
  const zhFontRetry = requireEl<HTMLButtonElement>("zh-font-retry");
  const checklistInputs = document.querySelectorAll<HTMLInputElement>("#card-checklist input[type=checkbox]");
  const emptyCardsHint = requireEl<HTMLElement>("empty-cards-hint");
  const usernameInput = requireEl<HTMLInputElement>("username-input");
  const usernameFormatHint = requireEl<HTMLElement>("username-format-hint");
  const snippetExampleHint = requireEl<HTMLElement>("snippet-example-hint");
  const artifactWorkflow = requireEl<HTMLElement>("artifact-workflow");
  const artifactConfig = requireEl<HTMLElement>("artifact-config");
  const artifactSnippet = requireEl<HTMLElement>("artifact-snippet");
  const copyWorkflowBtn = requireEl<HTMLButtonElement>("copy-workflow");
  const copyConfigBtn = requireEl<HTMLButtonElement>("copy-config");
  const copySnippetBtn = requireEl<HTMLButtonElement>("copy-snippet");
  const copyStatus = requireEl<HTMLElement>("copy-status");

  function updateCardButtons(): void {
    setActiveButton(cardTabButtons, previewCardId);
    cardSelect.value = previewCardId;
  }
  function updateThemeButtons(): void {
    setActiveButton(themeButtons, selectedTheme);
  }
  function updateLanguageButtons(): void {
    setActiveButton(languageButtons, selectedLanguage);
  }
  function updateAppearanceButtons(): void {
    setActiveButton(appearanceButtons, selectedAppearance);
  }

  function showPreviewError(error: unknown): void {
    // eslint-disable-next-line no-console
    console.error(error);
    previewErrorPanel.hidden = false;
  }
  function hidePreviewError(): void {
    previewErrorPanel.hidden = true;
  }

  function updatePreviewImage(): void {
    const card = renderedCards.find((c) => c.id === previewCardId);
    if (card === undefined) {
      return;
    }
    const svg = selectedAppearance === "dark" ? card.dark : card.light;
    setCardImage(previewImg, svg, buildAltText(card.title, card.desc));
  }

  function updateArtifacts(): void {
    artifactWorkflow.textContent = buildAdopterWorkflowYaml();

    const checkedOrdered = CARD_ORDER.filter((id) => checkedCardIds.has(id));
    artifactConfig.textContent = buildWidgetsYamlArtifact({ cards: [...checkedOrdered], theme: selectedTheme });
    emptyCardsHint.hidden = checkedOrdered.length > 0;

    const trimmedUsername = username.trim();
    const effectiveUsername = trimmedUsername === "" ? "octocat" : trimmedUsername;
    const selectedRendered = renderedCards.filter((card) => checkedCardIds.has(card.id as CardId));
    artifactSnippet.textContent = buildEmbedSnippetsArtifact({ username: effectiveUsername, cards: selectedRendered });
    snippetExampleHint.hidden = trimmedUsername !== "";
  }

  /**
   * Re-renders the D-04 five-widget representative set (always all five,
   * regardless of the checklist — the checklist only governs artifact ②'s
   * content, per UI-SPEC contract 4's explicit "these are two independent
   * controls" rule) against the current theme/language/fixture selection,
   * then refreshes both the preview image and all three adoption artifacts.
   */
  function renderAll(): void {
    let result: RenderedCard[];
    try {
      const config: ResolvedConfig = {
        theme: selectedTheme,
        language: selectedLanguage,
        timezone: "UTC",
        cards: CARD_ORDER.map((id) => ({ type: id })),
      };
      const resolved = resolveCards(config);
      const profile = useNewAccountFixture ? NEW_ACCOUNT_PROFILE : DEMO_PROFILE;
      result = renderAllCards(
        resolved,
        profile,
        { now: PINNED_NOW, seed: PINNED_SEED, language: selectedLanguage },
        resolveTheme(selectedTheme),
      );
    } catch (error) {
      showPreviewError(error);
      return;
    }
    renderedCards = result;
    hidePreviewError();
    updatePreviewImage();
    updateArtifacts();
  }

  function selectCard(id: CardId): void {
    previewCardId = id;
    updateCardButtons();
    updatePreviewImage();
  }

  function selectTheme(theme: ThemeName): void {
    selectedTheme = theme;
    updateThemeButtons();
    renderAll();
  }

  function selectAppearance(appearance: "light" | "dark"): void {
    selectedAppearance = appearance;
    updateAppearanceButtons();
    updatePreviewImage();
  }

  /**
   * D-01's zh-TW font state machine (05-UI-SPEC.md contract 1):
   * idle -> loading -> ready (session-permanent singleton) / failed -> retry.
   * The whole control bar (`#controls`, all four axes) is disabled with
   * `aria-busy="true"` during `loading` — a deliberate simplification (see
   * UI-SPEC's own reasoning) that trades a few seconds of disabled controls
   * for zero races between "font not ready yet" and "visitor already
   * switched to a different card/theme".
   */
  async function loadZhFont(): Promise<void> {
    fontState = "loading";
    setGroupDisabled(controls, true);
    previewCanvas.classList.add("is-font-loading");
    zhFontError.hidden = true;
    try {
      await ensureTcFont();
      fontState = "ready";
      selectedLanguage = "zh-TW";
    } catch {
      fontState = "failed";
      selectedLanguage = "en";
      zhFontError.hidden = false;
    } finally {
      setGroupDisabled(controls, false);
      previewCanvas.classList.remove("is-font-loading");
      updateLanguageButtons();
      renderAll();
    }
  }

  function handleLanguageClick(lang: "en" | "zh-TW"): void {
    if (lang === "en") {
      selectedLanguage = "en";
      updateLanguageButtons();
      renderAll();
      return;
    }
    if (fontState === "ready") {
      selectedLanguage = "zh-TW";
      updateLanguageButtons();
      renderAll();
      return;
    }
    void loadZhFont();
  }

  function handleZhFontRetry(): void {
    resetTcFontForRetry();
    void loadZhFont();
  }

  function handleChecklistChange(id: CardId, checked: boolean): void {
    if (checked) {
      checkedCardIds.add(id);
    } else {
      checkedCardIds.delete(id);
    }
    updateArtifacts();
  }

  function updateUsernameHint(): void {
    const trimmed = username.trim();
    const valid = trimmed === "" || USERNAME_PATTERN.test(trimmed);
    usernameFormatHint.hidden = valid;
  }

  function handleUsernameInput(value: string): void {
    username = value;
    updateUsernameHint();
    updateArtifacts();
  }

  function handleNewAccountToggle(event: MouseEvent): void {
    event.preventDefault();
    useNewAccountFixture = !useNewAccountFixture;
    newAccountToggle.textContent = useNewAccountFixture
      ? "Preview the flagship demo account instead"
      : "Preview a brand-new account instead";
    renderAll();
  }

  // ---- Wire events ----
  cardTabButtons.forEach((btn) => {
    btn.addEventListener("click", () => selectCard(btn.dataset.value as CardId));
  });
  cardSelect.addEventListener("change", () => selectCard(cardSelect.value as CardId));
  themeButtons.forEach((btn) => {
    btn.addEventListener("click", () => selectTheme(btn.dataset.value as ThemeName));
  });
  languageButtons.forEach((btn) => {
    btn.addEventListener("click", () => handleLanguageClick(btn.dataset.value as "en" | "zh-TW"));
  });
  appearanceButtons.forEach((btn) => {
    btn.addEventListener("click", () => selectAppearance(btn.dataset.value as "light" | "dark"));
  });
  zhFontRetry.addEventListener("click", handleZhFontRetry);
  checklistInputs.forEach((input) => {
    input.addEventListener("change", () => handleChecklistChange(input.dataset.value as CardId, input.checked));
  });
  usernameInput.addEventListener("input", () => handleUsernameInput(usernameInput.value));
  newAccountToggle.addEventListener("click", handleNewAccountToggle);

  copyWorkflowBtn.addEventListener("click", () => {
    void copyArtifact({
      getText: () => artifactWorkflow.textContent ?? "",
      button: copyWorkflowBtn,
      target: artifactWorkflow,
      statusRegion: copyStatus,
      label: "workflow YAML",
    });
  });
  copyConfigBtn.addEventListener("click", () => {
    void copyArtifact({
      getText: () => artifactConfig.textContent ?? "",
      button: copyConfigBtn,
      target: artifactConfig,
      statusRegion: copyStatus,
      label: "widgets.yml config",
    });
  });
  copySnippetBtn.addEventListener("click", () => {
    void copyArtifact({
      getText: () => artifactSnippet.textContent ?? "",
      button: copySnippetBtn,
      target: artifactSnippet,
      statusRegion: copyStatus,
      label: "embed snippet",
    });
  });

  // ---- Initial paint ----
  updateCardButtons();
  updateThemeButtons();
  updateLanguageButtons();
  updateAppearanceButtons();
  renderAll();
}

async function boot(): Promise<void> {
  await loadLatinFonts();
  registerAllWidgets();
  main();

  // The bundle initialized successfully — hide the static noscript/boot
  // fallback content now, never before this point (UI-SPEC page-shell
  // contract: the fallback is visible by default and only script that runs
  // AFTER a successful boot may hide it).
  document.getElementById("playground-boot-fallback")?.setAttribute("hidden", "");
  document.getElementById("playground-app")?.removeAttribute("hidden");
}

boot().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
});
