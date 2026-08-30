import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { marked } from "marked";
import { parseFrontmatter } from "./frontmatter.ts";
import { queuedRequests, type QueuedRequest } from "./queue.ts";
import { loadPlugins, timestampsFor } from "./repo.ts";
import { checkPlugin, parseMetadata } from "./rules.ts";
import { configSchema, zodErrors, type HubConfig } from "./schema.ts";
// Type-only, so the cycle with similar.ts (which needs CatalogPlugin) is erased.
import type { OpenIssue } from "./similar.ts";
import type { PluginMetadata, ValidationError } from "./types.ts";

export type CatalogSkill = { name: string; description: string };

export type CatalogPlugin = PluginMetadata & {
  path: string;
  skills: CatalogSkill[];
  readmeHtml: string;
  lastUpdated: string;
  addedAt: string;
  stale: boolean;
  install: Record<"claudeCode" | "copilot" | "codex" | "universal", string>;
};

export type Analysis = {
  config: HubConfig | null;
  plugins: CatalogPlugin[];
  recentlyAdded: string[];
  /** The repo's contributor guide, rendered, when it has one. */
  contributingHtml: string | null;
  /**
   * The open request queue, or null when this build did not read it. Never []
   * for "unknown": a local build has no token and must not publish a page
   * claiming nobody has asked for anything.
   */
  requests: QueuedRequest[] | null;
  errors: ValidationError[];
  now: Date;
};

export type AnalyseOptions = {
  root: string;
  now?: Date;
  /** The queue, fetched by the caller. The CLI never reaches the network. */
  issues?: OpenIssue[] | null;
};

export async function analyse({ root, now = new Date(), issues = null }: AnalyseOptions): Promise<Analysis> {
  const errors: ValidationError[] = [];
  const config = await loadConfig(root, errors);
  const raw = await loadPlugins(root);
  const codeowners = await readCodeowners(root);
  const contributing = await readFile(join(root, "CONTRIBUTING.md"), "utf8").catch(() => null);
  const contributingHtml =
    contributing === null ? null : demoteHeadings(marked.parse(contributing, { async: false }));

  const plugins: CatalogPlugin[] = [];
  const seenNames = new Map<string, string>();

  for (const plugin of raw) {
    const { metadata, errors: metadataErrors } = parseMetadata(plugin);
    const pluginErrors = [...metadataErrors, ...(await checkPlugin({ plugin, metadata, codeowners, seenNames }))];
    errors.push(...pluginErrors);
    if (!metadata || !config || pluginErrors.length > 0) continue;

    const { addedAt, lastUpdated } = await timestampsFor(root, plugin);
    plugins.push({
      ...metadata,
      path: `plugins/${plugin.dir}`,
      skills: plugin.skills.map((skill) => ({
        name: skill.name,
        description: String(parseFrontmatter(skill.text).data?.description ?? ""),
      })),
      readmeHtml: demoteHeadings(marked.parse(plugin.readmeText ?? "", { async: false })),
      lastUpdated: lastUpdated.toISOString(),
      addedAt: addedAt.toISOString(),
      stale: ageInDays(lastUpdated, now) > config.staleAfterDays,
      install: installCommands(config, metadata.name),
    });
  }

  plugins.sort((a, b) => a.name.localeCompare(b.name));
  const recentlyAdded = config
    ? plugins
        .filter((p) => ageInDays(new Date(p.addedAt), now) <= config.recentlyAddedDays)
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
        .slice(0, config.recentlyAddedLimit)
        .map((p) => p.name)
    : [];

  // Stages need `approvalLabel` and the URL fallback needs `repo`, so without a
  // config there is no queue to speak of — and `build` bails on that error anyway.
  const requests = config && issues ? queuedRequests(issues, config) : null;

  return { config, plugins, recentlyAdded, contributingHtml, requests, errors, now };
}

/**
 * A README owns its own heading tree, but on a plugin page it sits under the
 * plugin's h1. Shift every heading down one level so the page keeps a single
 * top-level heading and a readable outline.
 */
function demoteHeadings(html: string): string {
  return html.replace(/<(\/?)h([1-5])\b/g, (_match, slash: string, level: string) => `<${slash}h${Number(level) + 1}`);
}

function ageInDays(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
}

export function installCommands(config: HubConfig, plugin: string): CatalogPlugin["install"] {
  const script = `https://raw.githubusercontent.com/${config.repo}/main/scripts/install.sh`;
  const slashCommands = `/plugin marketplace add ${config.repo}\n/plugin install ${plugin}@${config.name}`;
  return {
    claudeCode: slashCommands,
    // Copilot CLI reads Claude's marketplace format natively, so the commands match.
    copilot: slashCommands,
    codex: `curl -fsSL ${script} | bash -s -- ${plugin} --tool codex`,
    universal: `curl -fsSL ${script} | bash -s -- ${plugin}`,
  };
}

async function loadConfig(root: string, errors: ValidationError[]): Promise<HubConfig | null> {
  const path = "agent-hub.config.json";
  let text: string;
  try {
    text = await readFile(join(root, path), "utf8");
  } catch {
    errors.push({ code: "config", path, message: `${path} is missing` });
    return null;
  }
  try {
    const parsed = configSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
    errors.push(...zodErrors(parsed.error, { code: "config", path }));
  } catch (error) {
    errors.push({ code: "config", path, message: `${path} is not valid JSON: ${(error as Error).message}` });
  }
  return null;
}

async function readCodeowners(root: string): Promise<string | null> {
  for (const candidate of ["CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS"]) {
    try {
      return await readFile(join(root, candidate), "utf8");
    } catch {
      // try the next conventional location
    }
  }
  return null;
}
