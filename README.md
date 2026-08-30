# Agent Hub

The internal marketplace for agent skills. One private monorepo holds every
plugin; an access-controlled GitHub Pages catalog lets anyone browse, search and
install them in **Claude Code**, **GitHub Copilot**, **OpenAI Codex** or **OpenCode**.

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
gh label create possible-duplicate --description "An existing skill or open request may already cover this" --color C5DEF5
gh label create approved-for-generation --description "Approved: an agent may draft this skill" --color 5319E7
```

Requests carry the first two labels, applied by the issue template, which can
only apply labels that already exist — an unlabelled request never reaches
triage. The third is applied by the duplicate check below; create it up front so
it has a description and a colour, and so triage can filter on it before the
first one lands. The fourth is `approvalLabel` in `agent-hub.config.json`:
applying it starts generation, and it is also what sorts a request into
**Approved and generating** on the catalog's queue page.

Generation also needs a key for whichever model you run it on, in one secret:

```bash
gh secret set AGENT_API_KEY
```

## The generation engine

Which model drafts and evaluates skills is a config value, not a property of the
workflow. `engine` in `agent-hub.config.json`:

```json
"engine": {
  "id": "deepseek",
  "baseUrl": "https://api.deepseek.com/anthropic",
  "model": "deepseek-v4-pro",
  "subagentModel": "deepseek-v4-flash"
}
```

The runner drives the Claude Code CLI, which speaks the Anthropic wire protocol
to whatever `baseUrl` names — so any provider offering an Anthropic-compatible
endpoint is one edit away, and `AGENT_API_KEY` holds that provider's key. Drop
`baseUrl` to use Anthropic's own API. `subagentModel` is worth setting: eval runs
spawn one subagent per eval, and they are short, numerous and cheaper on a
smaller model. Whatever you pick is named in the pull request body, because a
reviewer should know what wrote the skill in front of them.

## Access control

The catalog is a GitHub Pages site. Set **Settings → Pages → Visibility** to
**Private** so only org members can reach it; the repo itself is private, and
there is no other auth layer because there is no backend. The publish workflow
does not change this setting — it is a one-time repo configuration.

This matters more than it used to. The catalog now republishes the open request
queue, which is text colleagues wrote in issues rather than anything that has
been through code review, so whoever can reach the site can read it.

## Request a skill

Use **Request a skill** on the catalog site, or open the
[skill request issue form](../../issues/new?template=skill-request.yml) directly.
The platform team triages; applying the approval label (`approvalLabel` in
`agent-hub.config.json`) starts an agent that drafts the plugin and turns each
scenario you wrote into an eval. The workflow then runs those evals in fresh
sessions, grades them against your expectations, and sends the failures back to
be fixed — up to three rounds, stopping as soon as everything passes. It opens a
pull request with you and the platform reviewers (`platformReviewers`) as
reviewers, carrying the grading table for every round in the body.

A skill that still fails on the last round gets its pull request anyway, with
the misses spelled out, and the run is marked failed. Nothing arrives claiming
to work on nobody's evidence.

The catalog's form asks for no credential. It checks the answers a requester
types — at least one role, at least one `Scenario:`/`Expected:` pair — then opens
GitHub's own issue form in a new tab with every field prefilled, and leaves the
typed answers on the page in case anything did not carry over. Authentication is
whatever GitHub session the requester already has, and the labels come from the
template rather than from the URL, so they apply regardless of the requester's
permissions.

### Does it already exist?

The best request is the one nobody has to write. The form ranks what you type
against every published skill — as you type it, and again when you submit — and
shows you the closest matches with the commands that install them. It never
blocks: if none of them fit, the button becomes **Continue anyway**.

The page ranks against the catalog only — an open request is not a published
skill — so rather than implying the list is complete it links to the queue page
below. The check that *does* rank against open requests runs where a token
exists: on the issue.

### The open request queue

`requests.html` lists every open `skill-request` issue, grouped by the stage its
labels put it in — **Needs triage**, **Approved and generating**, **Possible
duplicate** — with a count and the newest few also banded onto the home page.
Approval wins over duplicate: the approval label is a decision a maintainer took
after triage, and sending a reader to add scenarios to a request already being
drafted would be worse than saying nothing. Nothing is stored; the labels are
the state, read afresh on every build.

It is a snapshot, and it says so, carrying its build date and a link to the live
GitHub search. `pages.yml` republishes on issue events, so it is usually seconds
behind rather than minutes.

The queue reaches the build as a file, never an HTTP call — `pages.yml` fetches
it with the token it already has and passes the path to `--issues`. So a local
`npm run build` has no queue, and the page says *that* rather than claiming
nobody has asked for anything. In `index.json`, `requests` is `null` when the
build did not read the queue and `[]` when it read an empty one; those are
different facts and the site keeps them apart.

Every request is checked again once it is an issue — including ones filed on
GitHub directly, and again whenever one is edited. `check-duplicate.yml` shortlists
by wording, an agent judges whether each candidate really covers the request, and
the bot leaves one comment saying which skill to install instead, or which open
request to add your scenarios to. A match also adds `possible-duplicate`; editing
the request until it no longer matches takes the label off again. Nothing is ever
closed automatically, and the comment is edited in place rather than repeated.

When an existing skill *nearly* covers a request, the answer is to extend that
plugin rather than ship a second one that overlaps it — say what is missing on
the issue, and generation amends the existing plugin instead of creating a new one.

How alike two skills must read before any of this fires is `similarityFloor` in
`agent-hub.config.json`. Run the same check by hand with:

```bash
node packages/cli/bin/agent-hub.js find-similar --title "Some skill" --problem "What goes wrong today"
node packages/cli/bin/agent-hub.js find-similar --all   # published plugins that read like each other
```

### Carrying the answers over

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

At triage, `needs-triage` minus `possible-duplicate` is the queue that still
needs a human decision; the rest already have an answer waiting for the requester
to accept or reject.

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
node packages/cli/bin/agent-hub.js build --issues open.json   # …and the open request queue
node packages/cli/bin/agent-hub.js validate     # the CI gate
```

`build` is the only thing that writes `plugin.json`, `.claude-plugin/`,
`.github/copilot/marketplace.json` and `dist/site/`. Never hand-edit them;
`validate` fails on drift.

## Renaming

The marketplace name, display name, repo and site URL live only in
`agent-hub.config.json`. Change them there and rebuild.
