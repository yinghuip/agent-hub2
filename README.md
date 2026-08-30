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

Requests carry both labels, applied by the issue template. The template can only
apply labels that already exist, and an unlabelled request never reaches triage.

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

The catalog's form asks for no credential. It checks the answers a requester
types — at least one role, at least one `Scenario:`/`Expected:` pair — then opens
GitHub's own issue form in a new tab with every field prefilled, and leaves the
typed answers on the page in case anything did not carry over. Authentication is
whatever GitHub session the requester already has, and the labels come from the
template rather than from the URL, so they apply regardless of the requester's
permissions.

The prefill parameters are the issue template's own field ids, emitted into the
page from `REQUEST_SECTIONS` — the same table the parser reads headings from — so
the page, the template and the parser cannot drift apart. A test asserts every
parameter still matches an `id:` in `skill-request.yml`.

Two consequences of relying on URL prefill, both handled in the page:

- GitHub fills inputs and textareas but not dropdowns, so `Roles` is a
  comma-separated input. `parseSkillRequest` checks the values against the
  taxonomy and names the whole list back if one is wrong.
- An over-long URL gets a 414. Past a 6000-character budget the page drops
  `scenarios` from the link and puts it on the clipboard instead, so the other
  three answers and the labels still carry.

Requesters are not asked who will own the skill. Generated plugins take
`ownerTeam` from `defaultOwnerTeam` in `agent-hub.config.json`, and their
CODEOWNERS line from `platformReviewers`; a reviewer reassigns either on the
pull request, which is a required gate anyway.

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
