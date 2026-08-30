import { z } from "zod";
import { ROLES } from "./roles.ts";
import type { ValidationCode, ValidationError } from "./types.ts";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const PLUGIN_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const authorSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email().optional(),
    url: z.string().url().optional(),
  })
  .strict();

export const pluginMetadataSchema = z
  .object({
    name: z.string().regex(PLUGIN_NAME, "must be lowercase letters, digits and hyphens"),
    description: z.string().min(1, "is required"),
    version: z.string().regex(SEMVER, "must be a semver version like 1.2.0"),
    ownerTeam: z.string().min(1),
    author: authorSchema,
    roles: z.array(z.enum(ROLES)).min(1, "pick at least one role"),
    keywords: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const configSchema = z
  .object({
    name: z.string().regex(PLUGIN_NAME),
    displayName: z.string().min(1),
    description: z.string().min(1),
    /** `owner/repo` on GitHub; drives install commands and issue links. */
    repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
    siteUrl: z.string().url(),
    owner: authorSchema,
    staleAfterDays: z.number().int().positive().default(180),
    recentlyAddedDays: z.number().int().positive().default(30),
    recentlyAddedLimit: z.number().int().positive().default(5),
    approvalLabel: z.string().min(1).default("approved-for-generation"),
    /** `ownerTeam` for generated plugins; requesters are not asked for one. */
    defaultOwnerTeam: z.string().min(1).default("platform"),
    /**
     * How alike two skills must read before the catalog and the request bot
     * call them possible duplicates. A Dice coefficient over token sets, so a
     * long problem statement dilutes the score: 0.3 catches a paraphrase,
     * higher than ~0.5 catches only near-identical wording.
     */
    similarityFloor: z.number().min(0).max(1).default(0.3),
    /**
     * Which agent drafts and evaluates generated skills. Claude Code talks to
     * any Anthropic-compatible endpoint, so `baseUrl` is what makes the model a
     * configuration choice rather than a rewrite of the workflow; leave it out
     * to use Anthropic's own API. The key itself is never here — it is the
     * AGENT_API_KEY repository secret.
     */
    engine: z
      .object({
        /** Human label for the provider; it lands in the pull request body. */
        id: z.string().min(1),
        baseUrl: z.string().url().optional(),
        model: z.string().min(1).optional(),
        /** Model for the eval subagents, which are many and short. */
        subagentModel: z.string().min(1).optional(),
      })
      .strict()
      .default({ id: "anthropic" }),
    /** GitHub logins/teams added as required reviewers on generated PRs. */
    platformReviewers: z.array(z.string().min(1)).default([]),
    /**
     * The seed taxonomy for generated skills. A plugin is a topical collection
     * of skills, so generation upserts each approved skill into the plugin it
     * belongs to; these entries name the topics before any plugin exists on
     * disk. The plugin directory is only created when a first skill lands in
     * it, so an entry here is a target, not a promise.
     */
    collections: z
      .array(
        z
          .object({
            name: z.string().regex(PLUGIN_NAME, "must be lowercase letters, digits and hyphens"),
            description: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

export type HubConfig = z.infer<typeof configSchema>;

/** Flatten zod issues into our validation-error shape. */
export function zodErrors(
  error: z.ZodError,
  base: { code: ValidationCode; plugin?: string; path?: string },
): ValidationError[] {
  return error.issues.map((issue) => ({
    ...base,
    message: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  }));
}
