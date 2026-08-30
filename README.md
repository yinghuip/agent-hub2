# Agent Hub

The internal marketplace for agent skills. One private monorepo holds every
plugin; an access-controlled GitHub Pages catalog lets anyone browse, search and
install them in **Claude Code**, **GitHub Copilot** or **OpenAI Codex**.

There is no backend service. GitHub Actions is the pipeline, GitHub Pages is the
site, GitHub Issues is the request queue.

## Browse

The catalog is published to the URL in `agent-hub.config.json` (`siteUrl`).
Skills are grouped by scrum-team role, searchable client-side, and each listing
shows the rendered README plus copy-paste install commands per tool.

## Install a skill

Claude Code (and Copilot CLI, which reads the same format):

```
/plugin marketplace add yinghuip/agent-hub2
/plugin install pr-review-checklist@agent-hub
```

Any tool, via the universal fallback:

```bash
curl -fsSL https://raw.githubusercontent.com/yinghuip/agent-hub2/main/scripts/install.sh | bash -s -- pr-review-checklist
```

## Repo setup

One-time settings the pipeline assumes but cannot apply itself:

```bash
gh label create skill-request --description "A request for a new agent skill" --color 0E8A16
gh label create needs-triage --description "Maintainer needs to evaluate this issue" --color FBCA04
```

Requests carry both labels. A requester's fine-grained token cannot create a
missing label, so an unlabelled request would never reach triage.

## Access control

The catalog is a GitHub Pages site. Set **Settings → Pages → Visibility** to
**Private** so only org members can reach it; the repo itself is private, and
there is no other auth layer because there is no backend. The publish workflow
does not change this setting — it is a one-time repo configuration.

## Request a skill

Use **Request a skill** on the catalog site, or open the
[skill request issue form](../../issues/new?template=skill-request.yml) directly.
The platform team triages; applying the approval label (`approvalLabel` in
`agent-hub.config.json`) starts an agent that drafts the plugin, evaluates it
against the scenarios you wrote, and opens a pull request with you and the
platform reviewers (`platformReviewers`) as reviewers.

The form posts straight to the GitHub API from the browser, authenticated with
the requester's own fine-grained personal access token (`Issues: Read and write`
on this repo). The token goes to `api.github.com` and nowhere else — there is no
server to send it to, and the page never stores it. 401 / 403 / 404 responses are
explained in place, and GitHub's own issue form stays on the page as a fallback,
carrying over whatever has been typed.

A fine-grained PAT is the only no-backend option: completing an OAuth or device
flow needs a token exchange that GitHub does not expose to browsers. Note that a
token for an organisation-owned repo needs an org admin to approve it.

The page builds the issue body with the build's own `renderRequestIssue`,
emitted into the page verbatim, so what a requester posts is exactly what the
generation agent's parser reads back.

Generated PRs must never merge on the agent's own say-so. Protect `main` with
"Require a pull request before merging", "Require review from Code Owners" and
at least two approvals, so both the requester and a platform reviewer sign off.

## Contribute a skill

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: one directory under `plugins/`,
one canonical `plugin.yaml`, skills as `SKILL.md`, then `npm run build` and
commit the generated manifests.

## The pipeline

```bash
npm ci
npm test                                        # the build pipeline's test suite
node packages/cli/bin/agent-hub.js build        # manifests, marketplace files, catalog site
node packages/cli/bin/agent-hub.js validate     # the CI gate
```

`build` is the only thing that writes `plugin.json`, `.claude-plugin/`,
`.github/copilot/marketplace.json` and `dist/site/`. Never hand-edit them;
`validate` fails on drift.

## Renaming

The marketplace name, display name, repo and site URL live only in
`agent-hub.config.json`. Change them there and rebuild.
