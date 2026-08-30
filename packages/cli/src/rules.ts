import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { parseFrontmatter } from "./frontmatter.ts";
import type { RawPlugin } from "./repo.ts";
import { pluginMetadataSchema, zodErrors } from "./schema.ts";
import { detectSecrets } from "./secrets.ts";
import type { PluginMetadata, ValidationError } from "./types.ts";

export type RuleContext = {
  plugin: RawPlugin;
  /** Null when the canonical metadata did not parse; name-dependent rules skip. */
  metadata: PluginMetadata | null;
  codeowners: string | null;
  /** Plugin name -> the directory that claimed it, shared across the whole run. */
  seenNames: Map<string, string>;
};

type Rule = (context: RuleContext) => ValidationError[] | Promise<ValidationError[]>;

const dirPath = (plugin: RawPlugin) => `plugins/${plugin.dir}`;

/** Parse `plugin.yaml`. Every other rule reads the result rather than the file. */
export function parseMetadata(plugin: RawPlugin): { metadata: PluginMetadata | null; errors: ValidationError[] } {
  const path = plugin.metadataPath ?? `${dirPath(plugin)}/plugin.yaml`;
  const base = { code: "schema" as const, plugin: plugin.dir, path };

  if (!plugin.metadataText) {
    return {
      metadata: null,
      errors: [{ ...base, message: "plugin.yaml is missing; every plugin needs one canonical metadata file" }],
    };
  }
  try {
    const parsed = pluginMetadataSchema.safeParse(parseYaml(plugin.metadataText));
    if (parsed.success) return { metadata: parsed.data, errors: [] };
    return { metadata: null, errors: zodErrors(parsed.error, base) };
  } catch (error) {
    return { metadata: null, errors: [{ ...base, message: `plugin.yaml is not valid YAML: ${(error as Error).message}` }] };
  }
}

const nameMatchesDirectory: Rule = ({ plugin, metadata }) =>
  !metadata || metadata.name === plugin.dir
    ? []
    : [
        {
          code: "name-mismatch",
          plugin: plugin.dir,
          path: plugin.metadataPath ?? dirPath(plugin),
          message: `name "${metadata.name}" does not match its directory "${plugin.dir}"`,
        },
      ];

const nameIsUnique: Rule = ({ plugin, metadata, seenNames }) => {
  if (!metadata) return [];
  const claimedBy = seenNames.get(metadata.name);
  if (!claimedBy) {
    seenNames.set(metadata.name, plugin.dir);
    return [];
  }
  return [
    {
      code: "name-unique",
      plugin: plugin.dir,
      path: plugin.metadataPath ?? dirPath(plugin),
      message: `name "${metadata.name}" is already used by plugins/${claimedBy}`,
    },
  ];
};

const portableSubsetOnly: Rule = ({ plugin }) =>
  plugin.nonPortable.map((entry) => ({
    code: "portable-subset" as const,
    plugin: plugin.dir,
    path: `${dirPath(plugin)}/${entry}`,
    message: `"${entry}" is outside the portable subset — marketplace plugins may only contain skills/, mcp.json and a README so they run in every tool`,
  }));

const hasSkills: Rule = ({ plugin }) =>
  plugin.skills.length > 0
    ? []
    : [
        {
          code: "no-skills",
          plugin: plugin.dir,
          path: `${dirPath(plugin)}/skills`,
          message: "no skills found; expected skills/<skill-name>/SKILL.md",
        },
      ];

const skillFrontmatterIsValid: Rule = ({ plugin }) =>
  plugin.skills.flatMap((skill) => {
    const base = { code: "skill-frontmatter" as const, plugin: plugin.dir, path: skill.path };
    const { data, error } = parseFrontmatter(skill.text);
    if (error || !data) return [{ ...base, message: error ?? "unreadable" }];

    const errors: ValidationError[] = [];
    if (data.name !== skill.name) {
      errors.push({ ...base, message: `frontmatter name must be "${skill.name}" to match its directory` });
    }
    if (typeof data.description !== "string" || data.description.trim() === "") {
      errors.push({ ...base, message: "frontmatter needs a description" });
    }
    return errors;
  });

const hasReadme: Rule = ({ plugin }) =>
  plugin.readmeText !== null
    ? []
    : [{ code: "readme", plugin: plugin.dir, path: `${dirPath(plugin)}/README.md`, message: "README.md is missing" }];

const hasCodeowner: Rule = ({ plugin, codeowners }) =>
  codeowners?.includes(`/${dirPath(plugin)}/`)
    ? []
    : [
        {
          code: "codeowners",
          plugin: plugin.dir,
          path: "CODEOWNERS",
          message: `no CODEOWNERS entry for /${dirPath(plugin)}/ — every plugin needs an owning team`,
        },
      ];

const hasNoSecrets: Rule = async ({ plugin }) => {
  const errors: ValidationError[] = [];
  for (const file of plugin.files) {
    const text = await readFile(join(plugin.absDir, file.path), "utf8").catch(() => "");
    for (const kind of detectSecrets(text)) {
      errors.push({
        code: "secret",
        plugin: plugin.dir,
        path: `${dirPath(plugin)}/${file.path.split("\\").join("/")}`,
        message: `looks like a committed ${kind}`,
      });
    }
  }
  return errors;
};

const RULES: Rule[] = [
  nameMatchesDirectory,
  nameIsUnique,
  portableSubsetOnly,
  hasSkills,
  skillFrontmatterIsValid,
  hasReadme,
  hasCodeowner,
  hasNoSecrets,
];

/** Every rule, in report order. An empty result means the plugin is publishable. */
export async function checkPlugin(context: RuleContext): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];
  for (const rule of RULES) errors.push(...(await rule(context)));
  return errors;
}
