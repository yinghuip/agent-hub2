import type { CatalogPlugin } from "./analyse.ts";
import { REQUEST_SECTIONS } from "./request.ts";

export type SimilarKind = "plugin" | "request";

export type SimilarCandidate = {
  kind: SimilarKind;
  /** A plugin name, or an issue number as a string. */
  ref: string;
  name: string;
  /** The only text a score is ever computed from. */
  text: string;
  description: string;
  url: string;
  install?: CatalogPlugin["install"];
};

export type SimilarMatch = SimilarCandidate & { score: number };

/**
 * Rank candidates against a request, most similar first.
 *
 * Pure and import-free by contract: the catalog's request form embeds this
 * function verbatim, the same way it embeds `renderRequestIssue`, so the hint a
 * requester sees while typing and the verdict the bot posts minutes later
 * cannot rank differently. It may not reach for anything outside its own body.
 */
export function rankSimilar(
  query: string,
  candidates: SimilarCandidate[],
  floor: number,
  limit: number,
): SimilarMatch[] {
  // Padded so a whole-word lookup is one indexOf.
  var STOP =
    " a an and any are as at be been but by can do does for from has have how i if in into is it its each me my no not of on once one only or other our out over should so some than that the their them then there these they this to too up us use used using was we what when where which who why will with within without would you your ";

  /**
   * Enough to make "reviewers forget the checklist" meet "reviews a pull
   * request against the checklist". Crude on purpose: both sides are stemmed
   * the same way, so an over-eager rule costs recall symmetrically, never a
   * one-sided false match.
   */
  function stem(word: string): string {
    var root = word;
    if (root.length > 4 && root.slice(-3) === "ies") root = root.slice(0, -3) + "y";
    else if (root.length > 4 && /(?:ss|x|z|ch|sh)es$/.test(root)) root = root.slice(0, -2);
    else if (root.length > 2 && root.slice(-1) === "s" && root.slice(-2) !== "ss") root = root.slice(0, -1);
    if (root.length > 4 && root.slice(-3) === "ing") return root.slice(0, -3);
    if (root.length > 4 && root.slice(-2) === "ed") return root.slice(0, -2);
    // Skills are asked for by the person doing the job: reviewer, planner, tester.
    if (root.length > 4 && root.slice(-2) === "er") return root.slice(0, -2);
    return root;
  }

  function tokens(text: string): string[] {
    var unique: string[] = [];
    var raw = String(text || "").toLowerCase().split(/[^a-z0-9]+/);
    for (var i = 0; i < raw.length; i++) {
      var word = raw[i];
      if (!word || word.length < 2) continue;
      if (STOP.indexOf(" " + word + " ") !== -1) continue;
      var root = stem(word);
      if (unique.indexOf(root) === -1) unique.push(root);
    }
    return unique;
  }

  /** Dice coefficient over the two token sets: 0 when disjoint, 1 when equal. */
  function dice(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    var shared = 0;
    for (var i = 0; i < a.length; i++) {
      var token = a[i];
      if (token && b.indexOf(token) !== -1) shared++;
    }
    return (2 * shared) / (a.length + b.length);
  }

  var asked = tokens(query);
  var scored: SimilarMatch[] = [];
  for (var c = 0; c < candidates.length; c++) {
    var candidate = candidates[c];
    if (!candidate) continue;
    var score = dice(asked, tokens(candidate.text));
    if (score >= floor) {
      scored.push({
        kind: candidate.kind,
        ref: candidate.ref,
        name: candidate.name,
        text: candidate.text,
        description: candidate.description,
        url: candidate.url,
        install: candidate.install,
        score: Math.round(score * 1000) / 1000,
      });
    }
  }
  scored.sort(function (x, y) {
    return y.score - x.score || x.name.localeCompare(y.name);
  });
  return scored.slice(0, limit);
}

/** The text a request is reduced to before scoring: what it is, and what it is for. */
export function requestText(title: string, problem = ""): string {
  return `${title}\n${problem}`;
}

/**
 * Candidates from the catalog. Scored on what a skill *does* — name,
 * description, keywords, skill descriptions — and deliberately not on team or
 * roles: sharing an owner is no evidence of overlap, and every second plugin
 * lists `Developer`.
 */
export function pluginCandidates(plugins: CatalogPlugin[], baseUrl: string): SimilarCandidate[] {
  return plugins.map((plugin) => ({
    kind: "plugin" as const,
    ref: plugin.name,
    name: plugin.name,
    text: [plugin.name, plugin.description, ...plugin.keywords, ...plugin.skills.map((s) => s.description)].join(" "),
    description: plugin.description,
    url: `${baseUrl}/plugins/${plugin.name}.html`,
    install: plugin.install,
  }));
}

/** One open `skill-request` issue, as GitHub's REST list endpoint returns it. */
export type OpenIssue = {
  number: number;
  title: string;
  body?: string | null;
  html_url?: string;
  pull_request?: unknown;
};

/**
 * Reduce an open request to the text it is scored on: its title, plus the
 * problem statement if the body has one. Hand-edited issues, and any filed
 * before the form existed, keep their whole body — skipping them would let
 * through exactly the duplicate this is here to catch.
 *
 * Import-free by the same contract as `rankSimilar`: the request form embeds it
 * verbatim so the page and the bot score the queue the same way.
 */
export function issueText(title: string, body: string, problemHeading: string): string {
  var name = String(title || "").replace(/^skill request:\s*/i, "").trim();
  var text = String(body || "");
  var start = text.indexOf("### " + problemHeading);
  if (start !== -1) {
    var rest = text.slice(start + 4 + problemHeading.length);
    var end = rest.indexOf("\n### ");
    text = end === -1 ? rest : rest.slice(0, end);
  }
  return name + "\n" + text.trim();
}

/** The heading `issueText` looks for, so the page and the CLI agree on it. */
export const PROBLEM_HEADING = REQUEST_SECTIONS.find((section) => section.field === "problem")!.heading;

/** Candidates from the request queue, minus pull requests and the issue being checked. */
export function requestCandidates(issues: OpenIssue[], exclude?: number): SimilarCandidate[] {
  const candidates: SimilarCandidate[] = [];
  for (const issue of issues) {
    if (issue.pull_request || issue.number === exclude) continue;
    candidates.push({
      kind: "request",
      ref: String(issue.number),
      name: issue.title.replace(/^skill request:\s*/i, "").trim(),
      text: issueText(issue.title, issue.body ?? "", PROBLEM_HEADING),
      description: "",
      url: issue.html_url ?? "",
    });
  }
  return candidates;
}

export type FindSimilarOptions = {
  title: string;
  problem?: string;
  plugins: CatalogPlugin[];
  issues?: OpenIssue[];
  floor: number;
  limit?: number;
  /** The issue being checked, so a request never matches itself. */
  exclude?: number;
  baseUrl: string;
};

export function findSimilar(options: FindSimilarOptions): SimilarMatch[] {
  const candidates = [
    ...pluginCandidates(options.plugins, options.baseUrl),
    ...requestCandidates(options.issues ?? [], options.exclude),
  ];
  return rankSimilar(requestText(options.title, options.problem), candidates, options.floor, options.limit ?? 3);
}

/** Every pair of published plugins that scores above the floor. */
export function similarPairs(plugins: CatalogPlugin[], floor: number, baseUrl: string): { a: string; b: string; score: number }[] {
  const candidates = pluginCandidates(plugins, baseUrl);
  const pairs: { a: string; b: string; score: number }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const others = candidates.filter((_, index) => index !== i);
    for (const match of rankSimilar(candidates[i]!.text, others, floor, others.length)) {
      if (candidates[i]!.name.localeCompare(match.name) < 0) {
        pairs.push({ a: candidates[i]!.name, b: match.name, score: match.score });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}

/** What the judge decides about one shortlisted match. */
export type SimilarVerdict = { ref: string; verdict: "duplicate" | "extend" | "distinct"; reason?: string };

/**
 * Identifies the bot's own comment so a re-check edits it in place instead of
 * stacking a new one. A locator, not stored state: every verdict is recomputed
 * from the issue as it reads now.
 */
export const SIMILAR_COMMENT_MARKER = "<!-- agent-hub:similar -->";

/** What triage filters on: `needs-triage` minus this label is the clean queue. */
export const DUPLICATE_LABEL = "possible-duplicate";

const fence = (text: string) => ["```", text, "```"].join("\n");

function installBlock(match: SimilarMatch): string {
  const install = match.install;
  if (!install) return "";
  return [
    "",
    fence(install.claudeCode),
    "Copilot CLI reads the same marketplace, so the commands are identical.",
    "",
    "<details><summary>Codex, or any other tool</summary>",
    "",
    fence(`${install.codex}\n${install.universal}`),
    "</details>",
  ].join("\n");
}

function paragraph(match: SimilarMatch, verdict: SimilarVerdict): string {
  const reason = verdict.reason ? ` ${verdict.reason}` : "";
  if (match.kind === "request") {
    const lead =
      verdict.verdict === "duplicate"
        ? `**[#${match.ref}](${match.url}) already asks for this.**`
        : `**[#${match.ref}](${match.url}) asks for something very close.**`;
    return `${lead}${reason}\n\nAdd your scenarios to that request rather than running a second one — you will get the skill sooner, and it will cover both teams.`;
  }
  if (verdict.verdict === "duplicate") {
    return (
      `**[\`${match.name}\`](${match.url}) already does this.**${reason}\n\n` +
      `${match.description}\n\nInstall it:${installBlock(match)}`
    );
  }
  return (
    `**[\`${match.name}\`](${match.url}) nearly covers this.**${reason}\n\n` +
    `${match.description}\n\nInstall it and see how far it gets you:${installBlock(match)}\n\n` +
    `If something is still missing, say what here: we would rather extend \`${match.name}\` than ship a second skill that overlaps it.`
  );
}

/**
 * The comment the bot leaves on a request. Returns "" when there is nothing
 * worth saying, which is the caller's signal to clear the label instead.
 */
export function renderSimilarComment(
  matches: SimilarMatch[],
  verdicts: SimilarVerdict[],
  options: { degraded?: boolean; label?: string } = {},
): string {
  const label = options.label ?? DUPLICATE_LABEL;
  if (matches.length === 0) return "";

  if (options.degraded) {
    const list = matches.map(
      (match) =>
        `- ${match.kind === "request" ? `[#${match.ref}](${match.url})` : `[\`${match.name}\`](${match.url})`} — ${
          match.description || match.name
        }`,
    );
    return [
      SIMILAR_COMMENT_MARKER,
      "### Some of this may already exist",
      "",
      "These are the closest matches by wording. The automated check that judges them did not complete, so nobody — human or agent — has confirmed any of them yet; a maintainer will when they triage this.",
      "",
      ...list,
      "",
      "If you have already looked and none of them fit, say so here.",
    ].join("\n");
  }

  const judged = matches
    .map((match) => ({ match, verdict: verdicts.find((v) => v.ref === match.ref) }))
    .filter((pair): pair is { match: SimilarMatch; verdict: SimilarVerdict } => pair.verdict?.verdict === "duplicate" || pair.verdict?.verdict === "extend");
  if (judged.length === 0) return "";

  return [
    SIMILAR_COMMENT_MARKER,
    "### This may already exist",
    "",
    "Before we build anything, one of these may already be what you want:",
    "",
    judged.map(({ match, verdict }) => paragraph(match, verdict)).join("\n\n---\n\n"),
    "",
    "---",
    "",
    `A maintainer will confirm. If none of these fit, say what they miss and the \`${label}\` label comes off.`,
  ].join("\n");
}

/** Replaces the comment above once an edit clears the match. */
export function renderClearedComment(label = DUPLICATE_LABEL): string {
  return [
    SIMILAR_COMMENT_MARKER,
    "### No longer looks like a duplicate",
    "",
    `This request has been edited and no longer matches an existing skill or an open request, so the \`${label}\` label has been removed.`,
  ].join("\n");
}
