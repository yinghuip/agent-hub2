import { mkdtemp, mkdir, writeFile, utimes, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type Tree = Record<string, string>;

/** Materialise a plain path -> contents map into a fresh temp directory. */
export async function writeTree(tree: Tree): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agent-hub-"));
  for (const [path, contents] of Object.entries(tree)) {
    const full = join(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents, "utf8");
  }
  return root;
}

export async function touch(root: string, path: string, when: Date): Promise<void> {
  await utimes(join(root, path), when, when);
}

export async function readJson(root: string, path: string): Promise<any> {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

export async function read(root: string, path: string): Promise<string> {
  return readFile(join(root, path), "utf8");
}

export const CONFIG = JSON.stringify({
  name: "agent-hub",
  displayName: "Agent Hub",
  description: "Internal marketplace for agent skills.",
  repo: "acme/agent-hub",
  siteUrl: "https://acme.github.io/agent-hub",
  owner: { name: "Platform Team", email: "platform@acme.example" },
});

export const CODEOWNERS = codeownersFor("pr-review");

/** CODEOWNERS covering the pipeline plus one line per plugin under test. */
export function codeownersFor(...plugins: string[]): string {
  return ["/packages/ @acme/platform", ...plugins.map((p) => `/plugins/${p}/ @acme/web`)].join("\n") + "\n";
}

export function pluginYaml(overrides: Record<string, unknown> = {}): string {
  const base = {
    name: "pr-review",
    description: "Reviews pull requests against the team checklist.",
    version: "1.2.0",
    ownerTeam: "web",
    author: { name: "Web Team", email: "web@acme.example" },
    roles: ["Developer", "QA"],
    keywords: ["review", "pull-request"],
  };
  return JSON.stringify({ ...base, ...overrides }, null, 2);
}

export const SKILL_MD = `---
name: review-pr
description: Walk a pull request against the team checklist.
---

# Review a PR

Steps go here.
`;

/** A minimal valid repo tree with a single plugin. */
export function validTree(extra: Tree = {}): Tree {
  return {
    "agent-hub.config.json": CONFIG,
    CODEOWNERS,
    "plugins/pr-review/plugin.yaml": pluginYaml(),
    "plugins/pr-review/README.md": "# PR Review\n\nA **checklist** driven review skill.\n",
    "plugins/pr-review/skills/review-pr/SKILL.md": SKILL_MD,
    ...extra,
  };
}
