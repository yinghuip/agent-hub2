import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { analyse } from "./analyse.ts";
import { build, validate } from "./build.ts";
import { parseSkillRequest } from "./request.ts";
import {
  findSimilar,
  renderClearedComment,
  renderSimilarComment,
  similarPairs,
  type OpenIssue,
  type SimilarVerdict,
} from "./similar.ts";
import type { ValidationError } from "./types.ts";

const USAGE = `agent-hub — build and validate the skills marketplace

Usage:
  agent-hub build [--root <dir>] [--issues <path>]
                                      Generate manifests, marketplace files and the catalog site.
                                      --issues takes the JSON the GitHub issues endpoint returns,
                                      so the catalog can list the open request queue
  agent-hub validate [--root <dir>]   Run the CI gate: every rule, plus a manifest drift check
  agent-hub parse-request [--file <path>]
                                      Parse a skill-request issue body into JSON on stdout
  agent-hub find-similar --title <t> [--problem <p>] [--issues <path>] [--exclude <n>]
                         [--json | --comment [--verdicts <path>] [--degraded]] [--floor <n>] [--limit <n>]
                                      Rank existing skills and open requests against a request
  agent-hub find-similar --all        Report published plugins that read like each other
  agent-hub find-similar --cleared    Print the comment that retracts an earlier duplicate warning
`;

function report(errors: ValidationError[]): void {
  for (const error of errors) {
    const where = error.path ?? error.plugin ?? "repo";
    console.error(`  ✗ [${error.code}] ${where}: ${error.message}`);
  }
  console.error(`\n${errors.length} problem(s) found.`);
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

/**
 * The open queue, as the caller fetched it. Null means nobody read it, and a
 * failed read stays null rather than becoming an empty queue — the catalog is
 * the part that must work, but it must not claim nobody has asked for anything.
 */
async function readIssues(path: string | undefined): Promise<OpenIssue[] | null> {
  if (!path) return null;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (Array.isArray(parsed)) return parsed;
    console.error(`Open requests in ${path} are not a JSON array — ignoring them.`);
  } catch (error) {
    console.error(`Could not read open requests from ${path}: ${(error as Error).message}`);
  }
  return null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(argv: string[]): Promise<number> {
  const [command = "help"] = argv;
  const root = flag(argv, "root") ?? process.cwd();

  if (command === "build") {
    const result = await build({ root, issues: await readIssues(flag(argv, "issues")) });
    if (!result.ok) {
      console.error("Build failed — nothing was written.\n");
      report(result.errors);
      return 1;
    }
    console.log(`Generated ${result.written.length} files:`);
    for (const path of result.written) console.log(`  ${path}`);
    return 0;
  }

  if (command === "validate") {
    const result = await validate({ root });
    if (!result.ok) {
      console.error("Validation failed.\n");
      report(result.errors);
      return 1;
    }
    console.log(`${relative(process.cwd(), root) || "."} is valid.`);
    return 0;
  }

  if (command === "parse-request") {
    const file = flag(argv, "file");
    const body = file ? await readFile(file, "utf8") : await readStdin();
    const result = parseSkillRequest(body);
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  if (command === "find-similar") return findSimilarCommand(argv, root);

  console.log(USAGE);
  return command === "help" || command === "--help" ? 0 : 1;
}

/** Tolerate what an agent tends to hand back: a fenced block, or a wrapper object. */
function parseVerdicts(text: string): SimilarVerdict[] | null {
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const parsed = JSON.parse(stripped);
    const list = Array.isArray(parsed) ? parsed : (parsed as { verdicts?: unknown }).verdicts;
    return Array.isArray(list) ? (list as SimilarVerdict[]) : null;
  } catch {
    return null;
  }
}

async function findSimilarCommand(argv: string[], root: string): Promise<number> {
  const label = flag(argv, "label");
  if (argv.includes("--cleared")) {
    console.log(renderClearedComment(label));
    return 0;
  }

  const analysis = await analyse({ root });
  if (!analysis.config || analysis.errors.length > 0) {
    console.error("Cannot search: the plugins tree does not validate.\n");
    report(analysis.errors);
    return 1;
  }

  const baseUrl = analysis.config.siteUrl.replace(/\/+$/, "");
  const floor = Number(flag(argv, "floor") ?? analysis.config.similarityFloor);
  const limit = Number(flag(argv, "limit") ?? 3);

  if (argv.includes("--all")) {
    const pairs = similarPairs(analysis.plugins, floor, baseUrl);
    if (pairs.length === 0) {
      console.log(`No two published plugins score above ${floor}.`);
      return 0;
    }
    console.log(`Published plugins that read like each other (floor ${floor}):`);
    for (const pair of pairs) console.log(`  ${pair.score.toFixed(2)}  ${pair.a} / ${pair.b}`);
    return 0;
  }

  const title = flag(argv, "title");
  if (!title) {
    console.error("find-similar needs --title (or --all).");
    return 1;
  }

  // Here the queue is a nice-to-have: without it the check just has fewer
  // candidates, so an unreadable file costs nothing and says so.
  const issues = (await readIssues(flag(argv, "issues"))) ?? [];

  const exclude = flag(argv, "exclude");
  const matches = findSimilar({
    title,
    problem: flag(argv, "problem") ?? "",
    plugins: analysis.plugins,
    issues,
    floor,
    limit,
    exclude: exclude ? Number(exclude) : undefined,
    baseUrl,
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(matches, null, 2));
    return 0;
  }

  if (argv.includes("--comment")) {
    const verdictsFile = flag(argv, "verdicts");
    let verdicts: SimilarVerdict[] | null = argv.includes("--degraded") ? null : [];
    if (verdictsFile && !argv.includes("--degraded")) {
      verdicts = parseVerdicts(await readFile(verdictsFile, "utf8").catch(() => ""));
      if (verdicts === null) console.error(`No usable verdicts in ${verdictsFile} — falling back to the wording-only comment.`);
    }
    const body = renderSimilarComment(matches, verdicts ?? [], { degraded: verdicts === null, label });
    if (body) console.log(body);
    return 0;
  }

  if (matches.length === 0) {
    console.log("No existing skill or open request looks close.");
    return 0;
  }
  console.log(`${matches.length} possible duplicate(s) (floor ${floor}):`);
  for (const match of matches) {
    const label = match.kind === "request" ? `#${match.ref} ${match.name}` : match.name;
    console.log(`  ${match.score.toFixed(2)}  ${match.kind.padEnd(7)}  ${label}`);
    if (match.description) console.log(`          ${match.description}`);
  }
  return 0;
}
