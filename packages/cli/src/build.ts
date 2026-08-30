import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { analyse, type AnalyseOptions } from "./analyse.ts";
import { generateManifests } from "./manifests.ts";
import { generateSite } from "./site.ts";
import type { ValidationError } from "./types.ts";

export type BuildResult = { ok: boolean; errors: ValidationError[]; written: string[] };

async function writeFiles(root: string, files: Map<string, string>): Promise<string[]> {
  for (const [path, contents] of files) {
    const full = join(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, contents, "utf8");
  }
  return [...files.keys()].sort();
}

/**
 * Turn the plugins tree into every generated artifact: both per-plugin
 * manifests, both marketplace files, and the catalog site. Emits nothing when
 * the tree does not validate.
 */
export async function build(options: AnalyseOptions): Promise<BuildResult> {
  const analysis = await analyse(options);
  if (analysis.errors.length > 0 || !analysis.config) {
    return { ok: false, errors: analysis.errors, written: [] };
  }

  const files = new Map([
    ...generateManifests(analysis.config, analysis.plugins),
    ...generateSite(analysis, analysis.config),
  ]);
  return { ok: true, errors: [], written: await writeFiles(options.root, files) };
}

/**
 * The CI gate: every build rule, plus a check that the committed manifests
 * still match the canonical metadata.
 */
export async function validate(options: AnalyseOptions): Promise<{ ok: boolean; errors: ValidationError[] }> {
  const analysis = await analyse(options);
  if (analysis.errors.length > 0 || !analysis.config) {
    return { ok: false, errors: analysis.errors };
  }

  const errors: ValidationError[] = [];
  for (const [path, expected] of generateManifests(analysis.config, analysis.plugins)) {
    const actual = await readFile(join(options.root, path), "utf8").catch(() => null);
    if (actual === expected) continue;
    errors.push({
      code: "manifest-drift",
      path,
      plugin: path.startsWith("plugins/") ? path.split("/")[1] : undefined,
      message:
        actual === null
          ? `${path} has not been generated — run \`agent-hub build\` and commit the result`
          : `${path} does not match plugin.yaml — run \`agent-hub build\` and commit the result`,
    });
  }
  return { ok: errors.length === 0, errors };
}
