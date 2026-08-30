# Context: Agent Hub

An internal marketplace for agent skills, run by the platform team for one org.
A private GitHub monorepo is the registry; GitHub Actions is the pipeline;
GitHub Pages is the catalog. There is no backend service anywhere.

## Glossary

- **Plugin** — one directory under `plugins/`: the unit that is versioned,
  owned, listed and installed. Never called a "package".
- **Skill** — one `SKILL.md` (plus its directory) inside a plugin's `skills/`.
  A plugin ships one or more skills. "Skill" is the user-facing word for what
  someone wants; "plugin" is the shipping unit.
- **Canonical metadata** — `plugins/<name>/plugin.yaml`, the single
  hand-authored description of a plugin. Everything else is generated.
- **Generated manifest** — `plugin.json` (agent-plugins.org v1.0.0, read by
  Copilot and Codex) and `.claude-plugin/plugin.json` (Claude Code). Both come
  from the canonical metadata; hand-editing them is `manifest-drift`.
- **Marketplace file** — the repo-level index of plugins, one per tool family:
  `.claude-plugin/marketplace.json` and `.github/copilot/marketplace.json`.
- **Catalog** — the static site under `dist/site`, generated from the same
  analysis. Its `index.json` is the contract the site is tested through.
- **Portable subset** — the only content a marketplace plugin may contain:
  `SKILL.md` skills and `mcp.json`, plus its README, canonical metadata,
  generated manifests and optional `LICENSE` / `CHANGELOG.md` (all inert in
  every tool). Hooks, slash commands and subagents are Claude-only and
  therefore lint failures. The exact list is in CONTRIBUTING.md.
- **Role** — one of the fixed taxonomy {Developer, QA, Business Analyst,
  Product Owner, Scrum Master, UX Designer, General}. Used for catalog grouping
  and on the request form.
- **Skill request** — a GitHub issue created from the request form, under the
  requester's own identity (their own fine-grained PAT, posted from the browser).
  `renderRequestIssue` writes the issue body and `parseSkillRequest` reads it
  back; the two are inverses, tested by round-trip. Approving it with the label in
  `agent-hub.config.json` (`approvalLabel`) triggers generation.
- **Possible duplicate** — a request that reads like a published skill or an
  open request. Scored by `rankSimilar` (a Dice coefficient over token sets,
  floored by `similarityFloor`), judged by an agent as *duplicate*, *extend* or
  *distinct*, and surfaced as a comment plus the `possible-duplicate` label. The
  same ranker runs in the catalog's request form, embedded verbatim, so the two
  can never disagree. Advisory only: nothing is ever closed automatically.
- **Stale** — no update for `staleAfterDays` (6 months). A badge only; nothing
  is auto-removed.

## Seams

The build pipeline CLI (`packages/cli`) is the primary seam: plugins tree in,
files or validation errors out, no network and no GitHub dependency. Nearly
every rule in the spec is tested there. GitHub workflows are untested glue; the
one testable piece — the issue-body → structured request parser — lives in the
CLI package and is a pure function.
