/** The closed vocabulary of failure codes, as documented in CONTRIBUTING.md. */
export type ValidationCode =
  | "config"
  | "schema"
  | "name-mismatch"
  | "name-unique"
  | "portable-subset"
  | "no-skills"
  | "skill-frontmatter"
  | "readme"
  | "codeowners"
  | "secret"
  | "manifest-drift";

export type ValidationError = {
  code: ValidationCode;
  message: string;
  plugin?: string;
  /** Repo-relative path the error is about. */
  path?: string;
};

export type Author = { name: string; email?: string; url?: string };

export type PluginMetadata = {
  name: string;
  description: string;
  version: string;
  ownerTeam: string;
  author: Author;
  roles: string[];
  keywords: string[];
};
