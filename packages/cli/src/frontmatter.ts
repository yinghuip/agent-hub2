import { parse as parseYaml } from "yaml";

export type Frontmatter = { data: Record<string, unknown> | null; error: string | null };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(text: string): Frontmatter {
  const match = FRONTMATTER.exec(text);
  if (!match) return { data: null, error: "missing YAML frontmatter delimited by ---" };
  try {
    const data = parseYaml(match[1]!);
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { data: null, error: "frontmatter must be a YAML mapping" };
    }
    return { data: data as Record<string, unknown>, error: null };
  } catch (error) {
    return { data: null, error: `frontmatter is not valid YAML: ${(error as Error).message}` };
  }
}
