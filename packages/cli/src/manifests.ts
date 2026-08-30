import type { Analysis, CatalogPlugin } from "./analyse.ts";
import { ROLES } from "./roles.ts";
import type { HubConfig } from "./schema.ts";

export const AGENT_PLUGINS_SCHEMA = "https://agent-plugins.org/schema/v1.0.0/plugin.json";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const dropUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

/** The fields every manifest and marketplace entry projects from the canonical metadata. */
function entry(plugin: CatalogPlugin) {
  return dropUndefined({
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    author: plugin.author,
    keywords: plugin.keywords,
  });
}

/** The agent-plugins.org v1.0.0 manifest read by Copilot and Codex. */
export function agentPluginsManifest(plugin: CatalogPlugin) {
  return { $schema: AGENT_PLUGINS_SCHEMA, ...entry(plugin) };
}

/** The Claude Code plugin manifest, from the same canonical metadata. */
export function claudeManifest(plugin: CatalogPlugin) {
  return entry(plugin);
}

/** Generated files that live in the repo and are checked for drift in CI. */
export function generateManifests(config: HubConfig, plugins: CatalogPlugin[]): Map<string, string> {
  const files = new Map<string, string>();

  for (const plugin of plugins) {
    files.set(`${plugin.path}/plugin.json`, json(agentPluginsManifest(plugin)));
    files.set(`${plugin.path}/.claude-plugin/plugin.json`, json(claudeManifest(plugin)));
  }

  files.set(
    ".claude-plugin/marketplace.json",
    json({
      name: config.name,
      owner: config.owner,
      metadata: { description: config.description, version: "1.0.0" },
      plugins: plugins.map((plugin) => ({ ...entry(plugin), source: `./${plugin.path}` })),
    }),
  );

  files.set(
    ".github/copilot/marketplace.json",
    json({
      name: config.name,
      description: config.description,
      plugins: plugins.map(({ name, path, description, version }) => ({
        name,
        source: `./${path}`,
        description,
        version,
      })),
    }),
  );

  return files;
}

export function catalogIndex(analysis: Analysis, config: HubConfig) {
  return {
    generatedAt: analysis.now.toISOString(),
    site: {
      name: config.name,
      displayName: config.displayName,
      description: config.description,
      repo: config.repo,
      siteUrl: config.siteUrl,
    },
    roles: [...ROLES],
    recentlyAdded: analysis.recentlyAdded,
    /** null means the build did not read the queue; [] means it read an empty one. */
    requests: analysis.requests,
    plugins: analysis.plugins,
  };
}
