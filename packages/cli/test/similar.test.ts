import { describe, expect, it } from "vitest";
import type { CatalogPlugin } from "../src/analyse.ts";
import {
  DUPLICATE_LABEL,
  PROBLEM_HEADING,
  SIMILAR_COMMENT_MARKER,
  findSimilar,
  issueText,
  pluginCandidates,
  rankSimilar,
  renderClearedComment,
  renderSimilarComment,
  requestCandidates,
  requestText,
  similarPairs,
  type OpenIssue,
  type SimilarMatch,
} from "../src/index.ts";

const FLOOR = 0.3;

function plugin(over: Partial<CatalogPlugin> & { name: string }): CatalogPlugin {
  return {
    description: "",
    version: "1.0.0",
    ownerTeam: "web",
    author: { name: "Web Team" },
    roles: ["Developer"],
    keywords: [],
    path: `plugins/${over.name}`,
    skills: [],
    readmeHtml: "",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    addedAt: "2026-01-01T00:00:00.000Z",
    stale: false,
    install: {
      claudeCode: `/plugin marketplace add acme/agent-hub\n/plugin install ${over.name}@agent-hub`,
      copilot: `/plugin install ${over.name}@agent-hub`,
      codex: `curl -fsSL https://example/install.sh | bash -s -- ${over.name} --tool codex`,
      opencode: `curl -fsSL https://example/install.sh | bash -s -- ${over.name} --tool opencode`,
      universal: `curl -fsSL https://example/install.sh | bash -s -- ${over.name}`,
    },
    ...over,
  };
}

const CATALOG = [
  plugin({
    name: "pr-review-checklist",
    description: "Reviews a pull request against the team's checklist for tests, accessibility and rollback safety.",
    keywords: ["review", "pull-request"],
    skills: [{ name: "review-pr", description: "Walk a pull request against the team checklist." }],
  }),
  plugin({
    name: "sprint-retro",
    description: "Facilitates a sprint retrospective and captures the actions agreed.",
    keywords: ["retro", "agile"],
    skills: [{ name: "run-retro", description: "Run a retrospective and capture the actions." }],
  }),
];

const CANDIDATES = pluginCandidates(CATALOG, "https://acme.example");

const rank = (title: string, problem = "", limit = 3) =>
  rankSimilar(requestText(title, problem), CANDIDATES, FLOOR, limit);

describe("rankSimilar", () => {
  it("matches a paraphrase that shares no exact wording with the plugin name", () => {
    const matches = rank(
      "Checklist for reviewing pull requests",
      "Reviewers forget the team checklist, so PRs land without accessibility checks.",
    );

    expect(matches.map((match) => match.name)).toEqual(["pr-review-checklist"]);
    expect(matches[0]!.score).toBeGreaterThan(FLOOR);
  });

  it("leaves an unrelated request alone, even when it shares a word", () => {
    expect(rank("Release notes drafter", "Writing release notes by hand takes an hour each sprint.")).toEqual([]);
  });

  it("ignores the team and roles a skill is filed under", () => {
    // Every scoring field is empty, so only ownerTeam/roles could match — and must not.
    const bare = pluginCandidates([plugin({ name: "unrelated-thing" })], ".");
    expect(rankSimilar(requestText("web", "Developer"), bare, FLOOR, 3)).toEqual([]);
  });

  it("sorts by score and honours the limit", () => {
    const matches = rankSimilar(requestText("review retrospective checklist actions"), CANDIDATES, 0, 1);
    expect(matches).toHaveLength(1);
    expect(rankSimilar(requestText("review retrospective checklist actions"), CANDIDATES, 0, 5)).toEqual(
      [...rankSimilar(requestText("review retrospective checklist actions"), CANDIDATES, 0, 5)].sort(
        (a, b) => b.score - a.score,
      ),
    );
  });

  it("stays below the floor when only a single common word overlaps", () => {
    expect(rank("Sprint capacity planner", "Nobody knows how much a sprint can hold.")).toEqual([]);
  });
});

describe("issueText", () => {
  const body = [
    `### Skill title\n\nPR review checklist\n`,
    `### ${PROBLEM_HEADING}\n\nReviewers forget the checklist.\n`,
    `### Your team\n\nWeb\n`,
  ].join("\n");

  it("keeps the title and the problem, and drops the rest of the form", () => {
    expect(issueText("Skill request: PR review checklist", body, PROBLEM_HEADING)).toBe(
      "PR review checklist\nReviewers forget the checklist.",
    );
  });

  it("falls back to the whole body when the form's headings are gone", () => {
    expect(issueText("Something freehand", "we need a thing that reviews PRs", PROBLEM_HEADING)).toBe(
      "Something freehand\nwe need a thing that reviews PRs",
    );
  });
});

describe("requestCandidates", () => {
  const issues: OpenIssue[] = [
    { number: 7, title: "Skill request: PR checklist", body: "### Your team\n\nWeb\n", html_url: "https://gh/7" },
    { number: 8, title: "A pull request", body: "", html_url: "https://gh/8", pull_request: {} },
    { number: 9, title: "Skill request: mine", body: "", html_url: "https://gh/9" },
  ];

  it("skips pull requests and the issue being checked", () => {
    expect(requestCandidates(issues, 9).map((candidate) => candidate.ref)).toEqual(["7"]);
  });
});

describe("findSimilar", () => {
  const issues: OpenIssue[] = [
    {
      number: 12,
      title: "Skill request: Pull request review helper",
      body: `### ${PROBLEM_HEADING}\n\nOur reviewers keep missing checklist items on pull requests.\n`,
      html_url: "https://gh/12",
    },
  ];

  it("finds an open request as readily as a published skill", () => {
    const matches = findSimilar({
      title: "Checklist for reviewing pull requests",
      problem: "Reviewers forget the team checklist on every pull request.",
      plugins: CATALOG,
      issues,
      floor: FLOOR,
      baseUrl: "https://acme.example",
      exclude: 99,
    });

    expect(matches.map((match) => `${match.kind}:${match.ref}`)).toContain("request:12");
    expect(matches.map((match) => `${match.kind}:${match.ref}`)).toContain("plugin:pr-review-checklist");
  });

  it("never matches the request against itself", () => {
    const matches = findSimilar({
      title: "Pull request review helper",
      problem: "Our reviewers keep missing checklist items on pull requests.",
      plugins: [],
      issues,
      floor: FLOOR,
      baseUrl: "https://acme.example",
      exclude: 12,
    });

    expect(matches).toEqual([]);
  });
});

describe("renderSimilarComment", () => {
  const matches = findSimilar({
    title: "Checklist for reviewing pull requests",
    problem: "Reviewers forget the team checklist.",
    plugins: CATALOG,
    issues: [],
    floor: FLOOR,
    baseUrl: "https://acme.example",
  });

  it("hands over the install commands when a skill already does the job", () => {
    const body = renderSimilarComment(matches, [
      { ref: "pr-review-checklist", verdict: "duplicate", reason: "It walks the same checklist." },
    ]);

    expect(body).toContain(SIMILAR_COMMENT_MARKER);
    expect(body).toContain("already does this");
    expect(body).toContain("/plugin install pr-review-checklist@agent-hub");
    expect(body).toContain("--tool codex");
    expect(body).toContain(DUPLICATE_LABEL);
  });

  it("asks for what is missing when the fix is extending a skill", () => {
    const body = renderSimilarComment(matches, [{ ref: "pr-review-checklist", verdict: "extend" }]);

    expect(body).toContain("nearly covers this");
    expect(body).toContain("than ship a second skill that overlaps it");
  });

  it("says nothing at all when every match is judged distinct", () => {
    expect(renderSimilarComment(matches, [{ ref: "pr-review-checklist", verdict: "distinct" }])).toBe("");
  });

  it("degrades to the shortlist, and admits nothing has judged it", () => {
    const body = renderSimilarComment(matches, [], { degraded: true });

    expect(body).toContain(SIMILAR_COMMENT_MARKER);
    expect(body).toContain("did not complete");
    expect(body).not.toContain("/plugin install");
  });

  it("points at an open request rather than an install command", () => {
    const request: SimilarMatch = {
      kind: "request",
      ref: "12",
      name: "Pull request review helper",
      text: "",
      description: "",
      url: "https://gh/12",
      score: 0.5,
    };
    const body = renderSimilarComment([request], [{ ref: "12", verdict: "duplicate" }]);

    expect(body).toContain("[#12](https://gh/12) already asks for this");
    expect(body).not.toContain("/plugin install");
  });

  it("retracts itself under the same marker", () => {
    expect(renderClearedComment()).toContain(SIMILAR_COMMENT_MARKER);
    expect(renderClearedComment("dupe")).toContain("`dupe` label has been removed");
  });
});

describe("similarPairs", () => {
  it("reports each overlapping pair once", () => {
    const twin = plugin({
      name: "pull-request-checklist",
      description: "Reviews a pull request against the team checklist for tests and accessibility.",
      keywords: ["review", "pull-request"],
    });

    const pairs = similarPairs([...CATALOG, twin], FLOOR, ".");
    expect(pairs).toHaveLength(1);
    expect([pairs[0]!.a, pairs[0]!.b].sort()).toEqual(["pr-review-checklist", "pull-request-checklist"]);
  });
});

describe("stemming", () => {
  it("meets a request written about the people doing the job", () => {
    // "reviewers … pull request" against "reviews a pull request": the paraphrase
    // that scored just under the floor before agent nouns were stemmed.
    const matches = rank("Release notes drafter", "Reviewers keep missing checklist items on a pull request.");
    expect(matches.map((match) => match.name)).toEqual(["pr-review-checklist"]);
  });
});
