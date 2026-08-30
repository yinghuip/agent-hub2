import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);

/** Package root for a dependency whose asset paths are not in its exports map. */
function packageRoot(entry: string, depth: number): string {
  let dir = dirname(require.resolve(entry));
  for (let i = 0; i < depth; i += 1) dir = dirname(dir);
  return dir;
}

const geist = packageRoot("geist/font/sans", 1);

/**
 * Faces are self-hosted: the catalog sits behind org access control and should
 * not hand a third-party font host a request log of who browsed it.
 */
export const FONT_FILES: { from: string; to: string }[] = [
  {
    from: require.resolve("@fontsource-variable/archivo-narrow/files/archivo-narrow-latin-wght-normal.woff2"),
    to: "dist/site/fonts/archivo-narrow.woff2",
  },
  { from: join(geist, "dist/fonts/geist-sans/Geist-Variable.woff2"), to: "dist/site/fonts/geist.woff2" },
  { from: join(geist, "dist/fonts/geist-mono/GeistMono-Variable.woff2"), to: "dist/site/fonts/geist-mono.woff2" },
];

/** One Phosphor glyph per role. Read from the icon package, never hand-drawn. */
const ROLE_ICONS: Record<string, string> = {
  Developer: "code",
  QA: "bug-beetle",
  "Business Analyst": "chart-line",
  "Product Owner": "compass",
  "Scrum Master": "users-three",
  "UX Designer": "pen-nib",
  General: "stack",
};

const iconCache = new Map<string, string>();

/** Inline SVG for a role, sized and stripped of its fixed fill. */
export function roleIcon(role: string): string {
  const cached = iconCache.get(role);
  if (cached) return cached;

  const name = ROLE_ICONS[role] ?? "stack";
  const source = readFileSync(require.resolve(`@phosphor-icons/core/assets/regular/${name}.svg`), "utf8");
  const svg = source
    .replace(/<\?xml[\s\S]*?\?>/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\swidth="[^"]*"/, "")
    .replace(/\sheight="[^"]*"/, "")
    .replace("<svg", '<svg class="icon" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false"')
    .trim();

  iconCache.set(role, svg);
  return svg;
}
