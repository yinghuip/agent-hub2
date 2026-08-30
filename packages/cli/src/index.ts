export { build, validate, type BuildResult } from "./build.ts";
export { analyse, type Analysis, type CatalogPlugin } from "./analyse.ts";
export {
  parseSkillRequest,
  renderRequestIssue,
  REQUEST_SECTIONS,
  REQUEST_LABELS,
  type SkillRequest,
  type RequestAnswers,
  type ParseResult,
} from "./request.ts";
export {
  findSimilar,
  pluginCandidates,
  rankSimilar,
  renderClearedComment,
  renderSimilarComment,
  requestCandidates,
  requestText,
  similarPairs,
  DUPLICATE_LABEL,
  PROBLEM_HEADING,
  issueText,
  SIMILAR_COMMENT_MARKER,
  type OpenIssue,
  type SimilarCandidate,
  type SimilarMatch,
  type SimilarVerdict,
} from "./similar.ts";
export { ROLES, type Role } from "./roles.ts";
export type { ValidationError, PluginMetadata } from "./types.ts";
