import { parseSkillRequest } from "./request.ts";
import type { HubConfig } from "./schema.ts";
import { DUPLICATE_LABEL, isRequestIssue, issueText, PROBLEM_HEADING, type OpenIssue } from "./similar.ts";

/**
 * Where an open request has got to, derived from its labels every time the site
 * is built. Nothing is stored: the labels are the state, the same way the
 * duplicate check recomputes its verdict from the issue as it reads now.
 */
export type RequestStage = "triage" | "generating" | "duplicate";

/** One open request, reduced to what the catalog shows. */
export type QueuedRequest = {
  number: number;
  title: string;
  /** Empty when the body did not parse; the page then omits the roles line. */
  roles: string[];
  problem: string;
  url: string;
  openedAt?: string;
  stage: RequestStage;
};

/** How much of a colleague's problem statement the catalog republishes. */
const SUMMARY_LIMIT = 240;

/** Labels arrive as objects from the API and as strings from a hand-written file. */
function labelNames(issue: OpenIssue): string[] {
  return (issue.labels ?? [])
    .map((label) => (typeof label === "string" ? label : (label?.name ?? "")))
    .filter(Boolean);
}

/**
 * Approval beats duplicate: the approval label is a maintainer's decision taken
 * after triage, while `possible-duplicate` is the bot's advisory and nobody
 * clears it on the way through. Filing an already-generating request under
 * "possible duplicate" would send a reader to add scenarios to something that
 * is already being drafted.
 *
 * Triage is the default whether or not `needs-triage` is literally present:
 * membership in this set is by `skill-request`, so a request that lost the
 * triage label by hand is still untriaged.
 */
function stageOf(labels: string[], approvalLabel: string): RequestStage {
  if (labels.includes(approvalLabel)) return "generating";
  if (labels.includes(DUPLICATE_LABEL)) return "duplicate";
  return "triage";
}

/** Flatten a problem statement into one scannable paragraph, and cap it. */
function summarise(text: string, limit = SUMMARY_LIMIT): string {
  const flat = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^###.*$/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const stripPrefix = (title: string) => title.replace(/^skill request:\s*/i, "").trim();

/**
 * Project the open `skill-request` issues onto what the catalog prints.
 *
 * Pure: the queue is fetched by the workflow, which has a token, and handed to
 * the build as data. Nothing here reaches the network.
 */
export function queuedRequests(issues: OpenIssue[], config: HubConfig): QueuedRequest[] {
  const requests: QueuedRequest[] = [];

  for (const issue of issues) {
    if (!isRequestIssue(issue)) continue;
    const body = issue.body ?? "";
    const parsed = parseSkillRequest(body);

    // A hand-edited request, or one filed before the form existed, still has a
    // body — and it is the best text there is. Its roles are not recoverable,
    // so the page shows none rather than a half-scraped guess.
    const roles = parsed.ok ? parsed.request.roles.slice() : [];
    const problem = parsed.ok ? parsed.request.problem : issueText("", body, PROBLEM_HEADING).trim();
    const title = stripPrefix(issue.title) || (parsed.ok ? parsed.request.title : "") || `#${issue.number}`;

    requests.push({
      number: issue.number,
      title,
      roles,
      problem: summarise(problem),
      url: issue.html_url || `https://github.com/${config.repo}/issues/${issue.number}`,
      openedAt: issue.created_at,
      stage: stageOf(labelNames(issue), config.approvalLabel),
    });
  }

  // Newest first. Issue numbers are monotonic, and the fetch order is not.
  return requests.sort((a, b) => b.number - a.number);
}
