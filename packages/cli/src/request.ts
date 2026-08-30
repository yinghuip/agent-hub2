import { ROLES, type Role } from "./roles.ts";

export type SkillRequest = {
  title: string;
  roles: Role[];
  problem: string;
  scenarios: { scenario: string; expected: string }[];
};

export type RequestError = { code: "missing-section" | "invalid-role" | "no-scenarios" | "scenario-format"; field: string; message: string };

export type ParseResult = { ok: true; request: SkillRequest } | { ok: false; errors: RequestError[] };

/**
 * One row per answer: the `### Heading` the parser reads back, and the issue
 * form's field `id`, which doubles as the query parameter the catalog's request
 * form prefills GitHub's form with. Both live here so the page, the template
 * and the parser cannot drift apart.
 */
const SECTIONS = {
  title: { heading: "Skill title", param: "skill-title" },
  roles: { heading: "Roles", param: "roles" },
  problem: { heading: "What problem should this skill solve?", param: "problem" },
  scenarios: { heading: "Example scenarios and expected results", param: "scenarios" },
} as const;

type Field = keyof typeof SECTIONS;

export const REQUEST_SECTIONS: { field: Field; heading: string; param: string }[] = (
  Object.keys(SECTIONS) as Field[]
).map((field) => ({ field, heading: SECTIONS[field].heading, param: SECTIONS[field].param }));

/** Labels every request carries, so triage can find them. */
export const REQUEST_LABELS = ["skill-request", "needs-triage"];

const NO_RESPONSE = /^_no response_$/i;

/** Split a GitHub issue-form body into `### Heading` -> answer. */
function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = body.split(/^###[ \t]+/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    const heading = (newline === -1 ? part : part.slice(0, newline)).trim();
    const value = (newline === -1 ? "" : part.slice(newline + 1))
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/^\\(\\*)###/gm, "$1###")
      .trim();
    sections.set(heading, NO_RESPONSE.test(value) ? "" : value);
  }
  return sections;
}

function parseScenarios(text: string): { scenarios: SkillRequest["scenarios"]; errors: RequestError[] } {
  const scenarios: SkillRequest["scenarios"] = [];
  const errors: RequestError[] = [];
  let scenario: string | null = null;
  let expected: string | null = null;

  /** Close the pair being built, or report the half that never got its other half. */
  const flush = () => {
    if (scenario === null) return;
    if (expected === null) {
      errors.push({ code: "scenario-format", field: "scenarios", message: `"${scenario}" has no "Expected:" line` });
    } else {
      scenarios.push({ scenario, expected });
    }
    scenario = null;
    expected = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/^\s*[-*]\s*/, "").trim();
    if (line === "") continue;
    const startsScenario = /^scenario\s*:\s*(.+)$/i.exec(line);
    const startsExpected = /^expected(?:\s+results?)?\s*:\s*(.+)$/i.exec(line);
    if (startsScenario) {
      flush();
      scenario = startsScenario[1]!.trim();
    } else if (startsExpected) {
      if (scenario === null) {
        errors.push({ code: "scenario-format", field: "scenarios", message: `"Expected: ${startsExpected[1]}" has no "Scenario:" line` });
      } else if (expected !== null) {
        errors.push({ code: "scenario-format", field: "scenarios", message: `"${scenario}" has two "Expected:" lines` });
      } else {
        expected = startsExpected[1]!.trim();
      }
    } else if (expected !== null) {
      // Requesters wrap. Reading only the first line silently drops the half
      // that says what should happen — "Expected: the score is below 4 / it is
      // not ready" would reach the generator as a condition with no
      // consequence, and the eval written from it would assert nothing.
      expected = `${expected}\n${line}`;
    } else if (scenario !== null) {
      scenario = `${scenario}\n${line}`;
    }
  }
  flush();
  if (scenarios.length === 0 && errors.length === 0) {
    errors.push({
      code: "no-scenarios",
      field: "scenarios",
      message: 'give at least one "Scenario: … / Expected: …" pair — these become the generated skill\'s eval criteria',
    });
  }
  return { scenarios, errors };
}

/**
 * Parse a skill-request issue body into the structured request the generation
 * agent works from. Pure: no GitHub calls, no filesystem.
 *
 * Sections the form no longer asks for are ignored rather than rejected, so
 * requests opened before a field was dropped still parse.
 */
export function parseSkillRequest(body: string): ParseResult {
  const sections = splitSections(body);
  const errors: RequestError[] = [];
  const value = (field: Field) => sections.get(SECTIONS[field].heading)?.trim() ?? "";

  for (const field of Object.keys(SECTIONS) as Field[]) {
    if (value(field) === "") {
      errors.push({ code: "missing-section", field, message: `"${SECTIONS[field].heading}" is empty or missing` });
    }
  }

  const rawRoles = value("roles")
    .split(/[,\n]/)
    .map((role) => role.trim())
    .filter(Boolean);
  const unknown = rawRoles.filter((role) => !ROLES.includes(role as Role));
  if (unknown.length > 0) {
    errors.push({
      code: "invalid-role",
      field: "roles",
      message: `unknown role(s): ${unknown.join(", ")}. Pick from: ${ROLES.join(", ")}`,
    });
  }

  const { scenarios, errors: scenarioErrors } = parseScenarios(value("scenarios"));
  if (value("scenarios") !== "") errors.push(...scenarioErrors);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    request: {
      title: value("title"),
      roles: rawRoles as Role[],
      problem: value("problem"),
      scenarios,
    },
  };
}

/** What the request form collects: roles ticked, scenarios still free text. */
export type RequestAnswers = {
  title: string;
  roles: string[];
  problem: string;
  scenarios: string;
};

/**
 * The issue body a request becomes; the inverse of `parseSkillRequest`.
 *
 * GitHub's issue form writes this body, not us — so this is the executable
 * specification of that output, held to it by the round-trip test. Change the
 * template's fields and this must change with them.
 */
export function renderRequestIssue(answers: RequestAnswers): { title: string; body: string; labels: string[] } {
  const values: Record<string, string> = {
    title: answers.title,
    roles: answers.roles.join(", "),
    problem: answers.problem,
    scenarios: answers.scenarios,
  };

  const body = REQUEST_SECTIONS.map(
    (section) => `### ${section.heading}\n\n${values[section.field]!.replace(/^(\\*)###/gm, "\\$1###")}\n`,
  ).join("\n");

  return { title: `Skill request: ${answers.title}`, body, labels: REQUEST_LABELS.slice() };
}
