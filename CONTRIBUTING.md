# Contributing a plugin

A plugin is a topical collection of skills, not a wrapper around one skill.
Before creating a new plugin, look for an existing one (or a seed collection in
`agent-hub.config.json`) your skill belongs to and add it there, bumping the
plugin's version — minor for a new skill, patch for changes to an existing one.
See `docs/adr/0001-plugins-as-topical-collections.md` for why.

## Layout

```
plugins/<plugin-name>/
├── plugin.yaml                 ← the one file you hand-author
├── README.md                   ← rendered on the catalog listing
├── mcp.json                    ← optional MCP server config
└── skills/
    └── <skill-name>/
        ├── SKILL.md
        └── evals/evals.json     ← the scenarios the skill has to satisfy
```

`plugin.yaml` is canonical. CI generates both tool manifests
(`plugin.json` and `.claude-plugin/plugin.json`), both repo-level marketplace
files and the catalog index from it, so nothing drifts.

```yaml
name: pr-review-checklist        # lowercase-hyphen, must match the directory
description: One sentence a browser can judge relevance from.
version: 1.0.0                   # semver; bump in every PR
ownerTeam: platform
author:
  name: Platform Team
  email: platform@example.com
roles: [Developer, QA]           # one or more of the fixed taxonomy below
keywords: [code-review, checklist]
```

Roles are exactly: **Developer, QA, Business Analyst, Product Owner,
Scrum Master, UX Designer, General**. A plugin with several roles appears under
each of them in the catalog.

## The portable subset

A marketplace plugin may contain **only** `SKILL.md` skills and `mcp.json`.
Claude-only features — `hooks/`, `commands/`, `agents/` — are a lint failure.
The full set of permitted top-level entries is therefore: `plugin.yaml` (or
`plugin.yml`), `README.md`, `mcp.json`, `skills/`, `LICENSE`, `CHANGELOG.md`,
and the generated `plugin.json` / `.claude-plugin/`. Anything else fails
`portable-subset`.
That rule is what makes "works in all three tools" literally true; without it a
Copilot user can install something their tool silently ignores.

Only the top level is restricted, so a skill may carry anything it needs beside
its `SKILL.md`. Use that for `evals/evals.json` in
[skill-creator's schema](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md):
the prompts and expectations the skill is meant to satisfy, so a reviewer can
re-run them instead of taking the author's word for it. Generated plugins get
this written for them from the request's scenarios; hand-authored ones should
carry it too.

Each `SKILL.md` needs frontmatter whose `name` matches its directory:

```markdown
---
name: review-pr
description: What it does, and when an agent should reach for it.
---
```

## Before you open the PR

```bash
npm ci
node packages/cli/bin/agent-hub.js build   # regenerate manifests
node packages/cli/bin/agent-hub.js validate
```

Commit the generated files. Then add a `CODEOWNERS` line for your plugin
directory — CI rejects plugins with no owner:

```
/plugins/<plugin-name>/ @your-org/your-team
```

## What CI checks

| Rule | Failure code |
| --- | --- |
| `agent-hub.config.json` is present and valid | `config` |
| `plugin.yaml` matches the canonical schema (incl. role taxonomy, semver) | `schema` |
| Name is lowercase-hyphen and matches its directory | `name-mismatch` |
| No two plugins share a name | `name-unique` |
| Only portable-subset content | `portable-subset` |
| At least one skill, with valid frontmatter | `no-skills`, `skill-frontmatter` |
| README present | `readme` |
| CODEOWNERS entry present | `codeowners` |
| No committed credentials | `secret` |
| Generated manifests match `plugin.yaml` | `manifest-drift` |

## Versioning and rollback

Per-plugin semver in `plugin.yaml`; "latest on main" is the only channel. No
tags, no pinning. Rollback is a plain `git revert`. CI fails a PR that changes
a plugin without bumping its version.

## Staleness

A plugin untouched for six months gets a **Stale** badge on the catalog. Nothing
is ever auto-removed; the badge just lets consumers weigh the risk.
