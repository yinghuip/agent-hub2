# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Agent Hub — an internal marketplace for agent skills. Plugins live in this monorepo; a GitHub Pages catalog lets people browse and install them into Claude Code, GitHub Copilot, or OpenAI Codex. There is no backend service: GitHub Actions is the pipeline, GitHub Pages is the site, GitHub Issues is the request queue.

Read `CONTEXT.md` before naming anything — it is the enforced vocabulary ("plugin", never "package"; "skill" is the user-facing word). Decisions and their reasons live in `docs/adr/`. Agent-workflow docs (issue tracker, triage labels) are indexed from `AGENTS.md`.

## Commands

```bash
npm ci
npm run typecheck                 # tsc -b, noEmit — types are checked, never emitted
npm test                          # vitest, tests in packages/cli/test/
npx vitest run packages/cli/test/build.test.ts      # single file
npx vitest run -t "test name"                       # single test by name
node packages/cli/bin/agent-hub.js build            # regenerate manifests + dist/site
node packages/cli/bin/agent-hub.js validate         # the CI gate
```

There is no linter. Preview the built site with the `site` config in `.claude/launch.json` (serves `dist/site`).

## Architecture

Node 22 runs the TypeScript in `packages/cli/src/` directly — no build output, and relative imports carry explicit `.ts` extensions.

**Generated vs. hand-authored.** `plugins/<name>/plugin.yaml` is the only hand-authored plugin file. `build` generates everything else from it: `plugin.json`, `.claude-plugin/`, `.github/copilot/marketplace.json`, and `dist/site/`. Hand-editing a generated manifest fails `validate` with `manifest-drift` — after changing a `plugin.yaml`, run `build` and commit the regenerated manifests.

**The CLI never touches the network.** The open-request queue is fetched by `pages.yml` with `gh api` and passed in as `--issues <path>`. In `dist/site/index.json`, `requests: null` means the build did not read the queue while `[]` means the queue was read and empty — this distinction is deliberate and test-enforced. `index.json` is the contract the site is tested through; presentation changes should not alter it.

**Module map** (`packages/cli/src/`): `cli.ts` parses args and dispatches `build` / `validate` / `parse-request` / `find-similar`. `repo.ts` reads the plugins tree and git history (plugin freshness comes from git, so CI checks out with `fetch-depth: 0`). `analyse.ts` is the central pass producing the `Analysis` object everything downstream consumes. `manifests.ts` emits the marketplace manifests; `site.ts` renders the HTML catalog. `queue.ts` / `similar.ts` / `request.ts` handle the request queue: `renderRequestIssue` and `parseSkillRequest` are inverses (round-trip tested), and `rankSimilar` is embedded verbatim into the request page so the page and the bot cannot disagree. The request page's prefill params must match the `id:`s in `.github/ISSUE_TEMPLATE/skill-request.yml` — a test enforces this.

**Workflows** (`.github/workflows/`): `ci.yml` (typecheck, test, validate, semver-bump check, secret scan), `pages.yml` (publish site; also fires on skill-request issue events), `generate-skill.yml` (approval label → agent drafts the plugin → eval rounds → PR), `check-duplicate.yml` (similarity shortlist + Claude judge on new issues), and the `pr-skill-check.yml` / `pr-skill-comment.yml` split (the untrusted PR job has no write token; the comment job reads its artifact).

## Conventions

- A plugin is a topical collection of skills — extend an existing plugin rather than shipping an overlapping one (ADR 0001).
- Plugins ship only the portable subset: `hooks/`, `commands/`, and `agents/` directories are lint failures.
- Every PR touching a plugin bumps that `plugin.yaml`'s `version:` (CI-enforced). Each plugin has a CODEOWNERS line. Rollback is `git revert`; there are no tags.
- Tests build real temp directory trees via `writeTree` in `packages/cli/test/helpers.ts` rather than mocking the filesystem.
- Comments here justify decisions (the why), not narrate code — match that register.
