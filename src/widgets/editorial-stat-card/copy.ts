/**
 * Editorial Stat Card copy — 02-UI-SPEC.md "Copywriting Contract". Field
 * order is fixed: commits/prs/issues/stars/followers, matching D-08's
 * five-field, no-field-dropped guarantee and the 3-over-2 grid's own
 * left-to-right, top-to-bottom reading order.
 */

export interface StatLabels {
  commits: string;
  prs: string;
  issues: string;
  stars: string;
  followers: string;
}

export const chromeEn = {
  title: "THE STATS",
};

export const labelsEn: StatLabels = {
  commits: "COMMITS",
  prs: "PRS",
  issues: "ISSUES",
  stars: "STARS",
  followers: "FOLLOWERS",
};

/**
 * zh-TW mode's chrome. mastheadEyebrow is fixed English brand furniture —
 * same convention as Almanac's chromeZh.mastheadEyebrow — decorative,
 * never translated, shown only in zh-TW mode (en mode's own title already
 * reads "THE STATS", so no separate eyebrow is needed there).
 */
export const chromeZh = {
  title: "統計卡",
  mastheadEyebrow: "THE STATS",
};

export const labelsZh: StatLabels = {
  commits: "提交",
  prs: "PR",
  issues: "議題",
  stars: "星標",
  followers: "追蹤者",
};
