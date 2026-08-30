import { describe, expect, it } from "vitest";
import { queuedRequests, DUPLICATE_LABEL, type QueuedRequest } from "../src/index.ts";
import { configSchema, type HubConfig } from "../src/schema.ts";
import { openIssue } from "./helpers.ts";

function config(overrides: Record<string, unknown> = {}): HubConfig {
  return configSchema.parse({
    name: "agent-hub",
    displayName: "Agent Hub",
    description: "Internal marketplace for agent skills.",
    repo: "acme/agent-hub",
    siteUrl: "https://acme.github.io/agent-hub",
    owner: { name: "Platform Team", email: "platform@acme.example" },
    ...overrides,
  });
}

const label = (name: string) => ({ name });
const byNumber = (requests: QueuedRequest[]) => Object.fromEntries(requests.map((r) => [r.number, r]));

describe("queuedRequests", () => {
  it("reads the stage off the labels", () => {
    const requests = byNumber(
      queuedRequests(
        [
          openIssue({ number: 1 }),
          openIssue({ number: 2, labels: [label("skill-request"), label("approved-for-generation")] }),
          openIssue({ number: 3, labels: [label("skill-request"), label(DUPLICATE_LABEL)] }),
        ],
        config(),
      ),
    );

    expect(requests[1]!.stage).toBe("triage");
    expect(requests[2]!.stage).toBe("generating");
    expect(requests[3]!.stage).toBe("duplicate");
  });

  // A maintainer approved it after triage; the bot's advisory never gets cleared.
  // Filing it under "possible duplicate" would send a reader to add scenarios to
  // something already being drafted.
  it("keeps an approved request generating even when it still looks like a duplicate", () => {
    const [request] = queuedRequests(
      [openIssue({ number: 7, labels: [label("skill-request"), label(DUPLICATE_LABEL), label("approved-for-generation")] })],
      config(),
    );

    expect(request!.stage).toBe("generating");
  });

  it("takes the approval label from the config rather than hardcoding it", () => {
    const issues = [openIssue({ number: 4, labels: [label("skill-request"), label("ship-it")] })];

    expect(queuedRequests(issues, config({ approvalLabel: "ship-it" }))[0]!.stage).toBe("generating");
    expect(queuedRequests(issues, config())[0]!.stage).toBe("triage");
  });

  // A hand-written --issues file is the one place labels are not API objects.
  it("reads labels whether they arrive as objects or as bare strings", () => {
    const [request] = queuedRequests(
      [openIssue({ number: 5, labels: ["skill-request", "approved-for-generation"] })],
      config(),
    );

    expect(request!.stage).toBe("generating");
  });

  it("drops pull requests, which the issues endpoint returns too", () => {
    const requests = queuedRequests(
      [openIssue({ number: 8 }), openIssue({ number: 9, pull_request: { url: "…" } })],
      config(),
    );

    expect(requests.map((request) => request.number)).toEqual([8]);
  });

  it("takes roles and the problem statement from a request the form wrote", () => {
    const [request] = queuedRequests(
      [openIssue({ number: 10, roles: ["QA", "Developer"], problem: "Flaky tests hide real breakage." })],
      config(),
    );

    expect(request!.roles).toEqual(["QA", "Developer"]);
    expect(request!.problem).toBe("Flaky tests hide real breakage.");
    // The problem section only — not the scenarios that follow it.
    expect(request!.problem).not.toContain("Scenario:");
  });

  // Requests filed before the form existed, and any edited by hand since, still
  // have a body — and it is the best text there is.
  it("falls back to the raw body when a request does not parse, and claims no roles", () => {
    const [request] = queuedRequests(
      [openIssue({ number: 11, title: "Terraform review", body: "Typed straight into GitHub, no headings." })],
      config(),
    );

    expect(request!.problem).toBe("Typed straight into GitHub, no headings.");
    expect(request!.roles).toEqual([]);
    expect(request!.title).toBe("Terraform review");
  });

  it("strips the title prefix the issue form adds", () => {
    const [request] = queuedRequests([openIssue({ number: 12, title: "Skill request: PR size checker" })], config());

    expect(request!.title).toBe("PR size checker");
  });

  it("truncates a long problem statement on a word boundary", () => {
    const problem = `${"alpha bravo ".repeat(40)}omega`;
    const [request] = queuedRequests([openIssue({ number: 13, problem })], config());

    expect(request!.problem.length).toBeLessThanOrEqual(241);
    expect(request!.problem.endsWith("…")).toBe(true);

    // What survives is a prefix of the original that stops on whitespace, so no
    // half-word is left standing in front of the ellipsis.
    const kept = request!.problem.slice(0, -1);
    expect(problem.startsWith(kept)).toBe(true);
    expect(problem[kept.length]).toBe(" ");
  });

  it("builds an issue URL from the config when the fetch carried none", () => {
    const [request] = queuedRequests([openIssue({ number: 14, html_url: undefined })], config());

    expect(request!.url).toBe("https://github.com/acme/agent-hub/issues/14");
  });

  it("orders newest first, whatever order the fetch returned", () => {
    const requests = queuedRequests(
      [openIssue({ number: 3 }), openIssue({ number: 41 }), openIssue({ number: 12 })],
      config(),
    );

    expect(requests.map((request) => request.number)).toEqual([41, 12, 3]);
  });

  it("reads an empty queue as empty rather than inventing one", () => {
    expect(queuedRequests([], config())).toEqual([]);
  });
});
