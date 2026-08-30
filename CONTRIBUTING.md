# Contributing a plugin

## Layout

```
plugins/<plugin-name>/
├── plugin.yaml                 ← the one file you hand-author
├── README.md                   ← rendered on the catalog listing
├── mcp.json                    ← optional MCP server config
└── skills/
    └── <skill-name>/SKILL.md
```

`plugin.yaml` is canonical. CI generates both tool manifests
(`plugin.json` and `.claude-plugin/plugin.json`), both repo-level marketplace
files and the catalog index from it, so nothing drifts.

```yaml
name: pr-review-checklist        # lowercase-hyphen, must match the directory
description: One sentence a browser can judge relevance from.
version: 1.0.0                   # semver; bump it in every PR that changes the plugin
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
That rule is what makes "works in all three tools" literally true; without it a
Copilot user can install something their tool silently ignores.

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
tags, no pinning. Rollback is a plain `git revert`.

## Staleness

A plugin untouched for six months gets a **Stale** badge on the catalog. Nothing
is ever auto-removed; the badge just lets consumers weigh the risk.
