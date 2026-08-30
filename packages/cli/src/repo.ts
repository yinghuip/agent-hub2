import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type RawFile = { path: string; mtime: Date };

export type RawPlugin = {
  /** Directory name, which is also the plugin's canonical id. */
  dir: string;
  absDir: string;
  metadataText: string | null;
  metadataPath: string | null;
  readmeText: string | null;
  skills: { name: string; path: string; text: string }[];
  /** Repo-relative paths of every hand-authored file in the plugin. */
  files: RawFile[];
  /** Top-level entries that are not part of the portable subset. */
  nonPortable: string[];
};

const PORTABLE_ENTRIES = new Set([
  "plugin.yaml",
  "plugin.yml",
  "plugin.json",
  "README.md",
  "mcp.json",
  "skills",
  ".claude-plugin",
  "LICENSE",
  "CHANGELOG.md",
]);

/** Paths the build owns; they must not influence a plugin's freshness. */
function isGenerated(relPath: string): boolean {
  const parts = relPath.split(sep);
  return parts[0] === "plugin.json" || parts[0] === ".claude-plugin";
}

async function walk(absDir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(absDir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const rel = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(join(absDir, entry.name), rel)));
    else out.push(rel);
  }
  return out;
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function loadPlugins(root: string): Promise<RawPlugin[]> {
  const pluginsDir = join(root, "plugins");
  let dirs: string[];
  try {
    dirs = (await readdir(pluginsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }

  const plugins: RawPlugin[] = [];
  for (const dir of dirs) {
    const absDir = join(pluginsDir, dir);
    const relPaths = await walk(absDir);

    const files: RawFile[] = [];
    for (const rel of relPaths) {
      if (isGenerated(rel)) continue;
      const info = await stat(join(absDir, rel));
      files.push({ path: rel, mtime: info.mtime });
    }

    const metadataPath = ["plugin.yaml", "plugin.yml"].find((p) => relPaths.includes(p)) ?? null;
    const skills: RawPlugin["skills"] = [];
    for (const rel of relPaths) {
      const parts = rel.split(sep);
      if (parts[0] !== "skills" || parts.length !== 3 || parts[2] !== "SKILL.md") continue;
      skills.push({ name: parts[1]!, path: join("plugins", dir, rel), text: await readFile(join(absDir, rel), "utf8") });
    }

    plugins.push({
      dir,
      absDir,
      metadataPath: metadataPath ? join("plugins", dir, metadataPath) : null,
      metadataText: metadataPath ? await readFile(join(absDir, metadataPath), "utf8") : null,
      readmeText: await readIfPresent(join(absDir, "README.md")),
      skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
      files,
      nonPortable: [...new Set(relPaths.map((p) => p.split(sep)[0]!))]
        .filter((entry) => !PORTABLE_ENTRIES.has(entry))
        .sort(),
    });
  }
  return plugins;
}

export type Timestamps = { addedAt: Date; lastUpdated: Date };

/**
 * Freshness comes from git history where the plugin is tracked, and from file
 * mtimes otherwise (new plugins in a PR, fixture trees, tarball checkouts).
 */
export async function timestampsFor(root: string, plugin: RawPlugin): Promise<Timestamps> {
  const fromGit = await gitTimestamps(root, `plugins/${plugin.dir}`);
  if (fromGit) return fromGit;

  const times = plugin.files.map((f) => f.mtime.getTime());
  const fallback = times.length ? times : [Date.now()];
  return { addedAt: new Date(Math.min(...fallback)), lastUpdated: new Date(Math.max(...fallback)) };
}

async function gitTimestamps(root: string, relDir: string): Promise<Timestamps | null> {
  try {
    const { stdout } = await exec("git", ["-C", root, "log", "--format=%cI", "--", relDir]);
    const lines = stdout.split("\n").filter(Boolean);
    if (lines.length === 0) return null;
    return { lastUpdated: new Date(lines[0]!), addedAt: new Date(lines[lines.length - 1]!) };
  } catch {
    return null;
  }
}
