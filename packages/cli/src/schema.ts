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
    /** GitHub logins/teams added as required reviewers on generated PRs. */
    platformReviewers: z.array(z.string().min(1)).default([]),
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
