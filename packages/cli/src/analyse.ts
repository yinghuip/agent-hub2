import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { marked } from "marked";
import { parseFrontmatter } from "./frontmatter.ts";
import { loadPlugins, timestampsFor, type RawPlugin } from "./repo.ts";
import { configSchema, pluginMetadataSchema, zodErrors, type HubConfig } from "./schema.ts";
import { detectSecrets } from "./secrets.ts";
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
  errors: ValidationError[];
  now: Date;
};

export type AnalyseOptions = { root: string; now?: Date };

export async function analyse({ root, now = new Date() }: AnalyseOptions): Promise<Analysis> {
  const errors: ValidationError[] = [];
  const config = await loadConfig(root, errors);
  const raw = await loadPlugins(root);
  const codeowners = await readCodeowners(root);

  const plugins: CatalogPlugin[] = [];
  const seenNames = new Map<string, string>();

  for (const plugin of raw) {
    const metadata = await checkPlugin({ plugin, codeowners, seenNames, errors });
    if (!metadata || !config) continue;

    const { addedAt, lastUpdated } = await timestampsFor(root, plugin);
    plugins.push({
      ...metadata,
      path: `plugins/${plugin.dir}`,
      skills: plugin.skills.map((skill) => ({
        name: skill.name,
        description: String(parseFrontmatter(skill.text).data?.description ?? ""),
      })),
      readmeHtml: marked.parse(plugin.readmeText ?? "", { async: false }),
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

  return { config, plugins, recentlyAdded, errors, now };
}

function ageInDays(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
}

export function installCommands(config: HubConfig, plugin: string): CatalogPlugin["install"] {
  const script = `https://raw.githubusercontent.com/${config.repo}/main/scripts/install.sh`;
  return {
    claudeCode: `/plugin marketplace add ${config.repo}\n/plugin install ${plugin}@${config.name}`,
    copilot: `copilot\n/plugin marketplace add ${config.repo}\n/plugin install ${plugin}@${config.name}`,
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

type CheckArgs = {
  plugin: RawPlugin;
  codeowners: string | null;
  seenNames: Map<string, string>;
  errors: ValidationError[];
};

/** Runs every per-plugin rule; returns metadata only when the plugin is publishable. */
async function checkPlugin({ plugin, codeowners, seenNames, errors }: CheckArgs): Promise<PluginMetadata | null> {
  const before = errors.length;
  const id = plugin.dir;
  const dirPath = `plugins/${id}`;

  let metadata: PluginMetadata | null = null;
  if (!plugin.metadataText || !plugin.metadataPath) {
    errors.push({
      code: "schema",
      plugin: id,
      path: `${dirPath}/plugin.yaml`,
      message: "plugin.yaml is missing; every plugin needs one canonical metadata file",
    });
  } else {
    try {
      const parsed = pluginMetadataSchema.safeParse(parseYaml(plugin.metadataText));
      if (parsed.success) metadata = parsed.data;
      else errors.push(...zodErrors(parsed.error, { code: "schema", plugin: id, path: plugin.metadataPath }));
    } catch (error) {
      errors.push({
        code: "schema",
        plugin: id,
        path: plugin.metadataPath,
        message: `plugin.yaml is not valid YAML: ${(error as Error).message}`,
      });
    }
  }

  if (metadata && metadata.name !== id) {
    errors.push({
      code: "name-mismatch",
      plugin: id,
      path: plugin.metadataPath ?? dirPath,
      message: `name "${metadata.name}" does not match its directory "${id}"`,
    });
  }
  if (metadata) {
    const owner = seenNames.get(metadata.name);
    if (owner) {
      errors.push({
        code: "name-unique",
        plugin: id,
        path: plugin.metadataPath ?? dirPath,
        message: `name "${metadata.name}" is already used by plugins/${owner}`,
      });
    } else {
      seenNames.set(metadata.name, id);
    }
  }

  for (const entry of plugin.nonPortable) {
    errors.push({
      code: "portable-subset",
      plugin: id,
      path: `${dirPath}/${entry}`,
      message: `"${entry}" is outside the portable subset — marketplace plugins may only contain skills/, mcp.json and a README so they run in every tool`,
    });
  }

  if (plugin.skills.length === 0) {
    errors.push({
      code: "no-skills",
      plugin: id,
      path: `${dirPath}/skills`,
      message: "no skills found; expected skills/<skill-name>/SKILL.md",
    });
  }
  for (const skill of plugin.skills) {
    const { data, error } = parseFrontmatter(skill.text);
    if (error || !data) {
      errors.push({ code: "skill-frontmatter", plugin: id, path: skill.path, message: error ?? "unreadable" });
      continue;
    }
    if (typeof data.name !== "string" || data.name !== skill.name) {
      errors.push({
        code: "skill-frontmatter",
        plugin: id,
        path: skill.path,
        message: `frontmatter name must be "${skill.name}" to match its directory`,
      });
    }
    if (typeof data.description !== "string" || data.description.trim() === "") {
      errors.push({ code: "skill-frontmatter", plugin: id, path: skill.path, message: "frontmatter needs a description" });
    }
  }

  if (plugin.readmeText === null) {
    errors.push({ code: "readme", plugin: id, path: `${dirPath}/README.md`, message: "README.md is missing" });
  }

  if (!codeowners || !codeowners.includes(`/${dirPath}/`)) {
    errors.push({
      code: "codeowners",
      plugin: id,
      path: "CODEOWNERS",
      message: `no CODEOWNERS entry for /${dirPath}/ — every plugin needs an owning team`,
    });
  }

  for (const file of plugin.files) {
    const text = await readFile(join(plugin.absDir, file.path), "utf8").catch(() => "");
    for (const kind of detectSecrets(text)) {
      errors.push({
        code: "secret",
        plugin: id,
        path: `${dirPath}/${file.path.split("\\").join("/")}`,
        message: `looks like a committed ${kind}`,
      });
    }
  }

  return errors.length === before ? metadata : null;
}
