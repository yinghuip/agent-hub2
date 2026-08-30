import { catalogIndex } from "./manifests.ts";
import type { Analysis, CatalogPlugin } from "./analyse.ts";
import { REQUEST_LABELS, REQUEST_SECTIONS, renderRequestIssue } from "./request.ts";
import { ROLES } from "./roles.ts";
import type { HubConfig } from "./schema.ts";

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatDate = (iso: string) => iso.slice(0, 10);

/** JSON safe to embed in a <script> element. */
const embedJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

function layout(config: HubConfig, title: string, body: string, depth: number): string {
  const base = depth === 0 ? "." : "..";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<link rel="stylesheet" href="${base}/styles.css">
</head>
<body>
<header class="site">
  <a class="brand" href="${base}/index.html">${escape(config.displayName)}</a>
  <nav>
    <a href="${base}/request.html">Request a skill</a>
    <a href="https://github.com/${escape(config.repo)}">Repo</a>
  </nav>
</header>
<main>
${body}
</main>
<footer>${escape(config.displayName)} — generated from <code>plugins/</code> by <code>agent-hub build</code>.</footer>
</body>
</html>
`;
}

function badge(text: string, kind = ""): string {
  return `<span class="badge ${kind}">${escape(text)}</span>`;
}

function card(plugin: CatalogPlugin): string {
  return `<article class="card" data-roles="${escape(plugin.roles.join("|"))}" data-search="${escape(
    [plugin.name, plugin.description, plugin.ownerTeam, ...plugin.keywords, ...plugin.roles].join(" ").toLowerCase(),
  )}">
  <h3><a href="./plugins/${escape(plugin.name)}.html">${escape(plugin.name)}</a></h3>
  <p>${escape(plugin.description)}</p>
  <p class="meta">v${escape(plugin.version)} · ${escape(plugin.ownerTeam)} · updated ${formatDate(plugin.lastUpdated)}
  ${plugin.stale ? badge("Stale", "stale") : ""}</p>
  <p class="roles">${plugin.roles.map((role) => badge(role)).join(" ")}</p>
</article>`;
}

function homePage(analysis: Analysis, config: HubConfig): string {
  const { plugins, recentlyAdded } = analysis;
  const recent = recentlyAdded
    .map((name) => plugins.find((p) => p.name === name))
    .filter((p): p is CatalogPlugin => Boolean(p));

  const populatedRoles = ROLES.filter((role) => plugins.some((p) => p.roles.includes(role)));
  const roleFilters = `<nav class="filters" aria-label="Filter by role">
  <button class="filter active" data-role-filter="">All</button>
  ${populatedRoles.map((role) => `<button class="filter" data-role-filter="${escape(role)}">${escape(role)}</button>`).join("\n  ")}
</nav>`;

  const roleSections = ROLES.map((role) => {
    const inRole = plugins.filter((p) => p.roles.includes(role));
    if (inRole.length === 0) return "";
    return `<section class="role" data-role="${escape(role)}">
  <h2>${escape(role)}</h2>
  <div class="grid">${inRole.map(card).join("\n")}</div>
</section>`;
  })
    .filter(Boolean)
    .join("\n");

  const body = `<h1>${escape(config.displayName)}</h1>
<p class="lede">${escape(config.description)}</p>
<input id="search" type="search" placeholder="Search ${plugins.length} skills by name, keyword or team…" autocomplete="off">
${roleFilters}
<p id="no-results" hidden>No skills match that search.</p>
${
  recent.length
    ? `<section class="recent"><h2>Recently added</h2><div class="grid">${recent.map(card).join("\n")}</div></section>`
    : ""
}
${roleSections}
<script id="catalog" type="application/json">${embedJson(catalogIndex(analysis, config))}</script>
<script>
(function () {
  var input = document.getElementById("search");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var sections = Array.prototype.slice.call(document.querySelectorAll("section"));
  var filters = Array.prototype.slice.call(document.querySelectorAll("[data-role-filter]"));
  var empty = document.getElementById("no-results");
  var role = "";

  function apply() {
    var terms = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
    var visible = 0;
    cards.forEach(function (card) {
      var haystack = card.getAttribute("data-search");
      var roles = card.getAttribute("data-roles").split("|");
      var match = terms.every(function (term) { return haystack.indexOf(term) !== -1; }) &&
        (role === "" || roles.indexOf(role) !== -1);
      card.hidden = !match;
      if (match) visible++;
    });
    sections.forEach(function (section) {
      section.hidden = section.querySelectorAll(".card:not([hidden])").length === 0;
    });
    empty.hidden = visible !== 0;
  }

  input.addEventListener("input", apply);
  filters.forEach(function (button) {
    button.addEventListener("click", function () {
      role = button.getAttribute("data-role-filter");
      filters.forEach(function (other) { other.classList.toggle("active", other === button); });
      apply();
    });
  });
})();
</script>`;
  return layout(config, config.displayName, body, 0);
}

function installBlock(label: string, command: string): string {
  return `<section class="install"><h3>${escape(label)}</h3><pre><code>${escape(command)}</code></pre></section>`;
}

function pluginPage(plugin: CatalogPlugin, config: HubConfig): string {
  const body = `<h1>${escape(plugin.name)} ${plugin.stale ? badge("Stale", "stale") : ""}</h1>
<p class="lede">${escape(plugin.description)}</p>
<dl class="facts">
  <dt>Version</dt><dd>${escape(plugin.version)}</dd>
  <dt>Owner</dt><dd>${escape(plugin.ownerTeam)} (${escape(plugin.author.name)})</dd>
  <dt>Roles</dt><dd>${plugin.roles.map((role) => badge(role)).join(" ")}</dd>
  <dt>Last updated</dt><dd>${formatDate(plugin.lastUpdated)}</dd>
  <dt>Skills</dt><dd>${plugin.skills.map((s) => escape(s.name)).join(", ")}</dd>
</dl>
<h2>Install</h2>
${installBlock("Claude Code", plugin.install.claudeCode)}
${installBlock("GitHub Copilot", plugin.install.copilot)}
${installBlock("OpenAI Codex", plugin.install.codex)}
${installBlock("Any tool (universal script)", plugin.install.universal)}
<h2>README</h2>
<article class="readme">${plugin.readmeHtml}</article>`;
  return layout(config, `${plugin.name} — ${config.displayName}`, body, 1);
}

function requestPage(config: HubConfig): string {
  const repo = JSON.stringify(config.repo);
  const body = `<h1>Request a skill</h1>
<p class="lede">Describe what you need in plain language. Your request becomes a GitHub issue under
<strong>your own</strong> account, so you stay reachable for questions and get notified when the skill ships.</p>

<form id="request">
  <label>Skill title<input name="title" required placeholder="PR review checklist"></label>

  <fieldset><legend>Which roles is this for?</legend>
    ${ROLES.map(
      (role) => `<label class="check"><input type="checkbox" name="roles" value="${escape(role)}"> ${escape(role)}</label>`,
    ).join("\n    ")}
  </fieldset>

  <label>What problem should this skill solve?
    <textarea name="problem" required rows="4" placeholder="What goes wrong today, and what should happen instead?"></textarea></label>

  <label>Example scenarios and expected results
    <textarea name="scenarios" required rows="6" placeholder="Scenario: A PR adds a new form field&#10;Expected: The skill flags the missing label&#10;&#10;Scenario: A PR only touches tests&#10;Expected: The skill says no checklist items apply"></textarea></label>
  <p class="hint">One <code>Scenario:</code> line and one <code>Expected:</code> line per example. These become the
  criteria the generating agent checks its own work against, so be concrete.</p>

  <label>Your team<input name="team" required placeholder="Web"></label>

  <label>Your GitHub token
    <input name="token" type="password" required autocomplete="off" placeholder="github_pat_…"></label>
  <p class="hint">A <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">fine-grained
  personal access token</a> scoped to <code>${escape(config.repo)}</code> with <strong>Issues: Read and write</strong>.
  It goes straight from your browser to GitHub — this page has no server, and never stores your token.</p>

  <button type="submit">Create the request</button>
  <p id="status" role="status"></p>
</form>

<p class="hint">No token, or it isn't working? <a id="fallback" href="https://github.com/${escape(
    config.repo,
  )}/issues/new?template=skill-request.yml" target="_blank" rel="noopener">Open the same form on GitHub</a>
— it carries over whatever you have typed here.</p>

<script>
(function () {
  var REQUEST_SECTIONS = ${embedJson(REQUEST_SECTIONS)};
  var REQUEST_LABELS = ${embedJson(REQUEST_LABELS)};
  // Emitted from the build's own renderer, so the page and the parser that reads
  // the issue back cannot drift apart.
  var renderRequestIssue = ${renderRequestIssue.toString()};

  var REPO = ${repo};
  var API = "https://api.github.com/repos/" + REPO + "/issues";
  var form = document.getElementById("request");
  var status = document.getElementById("status");
  var fallback = document.getElementById("fallback");
  var button = form.querySelector("button");

  function say(message, kind) {
    status.textContent = message;
    status.className = kind || "";
  }

  function answers() {
    var data = new FormData(form);
    return {
      title: String(data.get("title") || ""),
      roles: data.getAll("roles").map(String),
      problem: String(data.get("problem") || ""),
      scenarios: String(data.get("scenarios") || ""),
      team: String(data.get("team") || "")
    };
  }

  /** The same fields, handed to GitHub's own issue form when posting is not an option. */
  fallback.addEventListener("click", function () {
    var answer = answers();
    fallback.href = "https://github.com/" + REPO + "/issues/new?" + new URLSearchParams({
      template: "skill-request.yml",
      title: "Skill request: " + answer.title,
      "skill-title": answer.title,
      roles: answer.roles.join(", "),
      problem: answer.problem,
      scenarios: answer.scenarios,
      team: answer.team
    }).toString();
  });

  /** Catch what the generation agent's parser would reject, while it is still fixable. */
  function complain(answer) {
    if (answer.roles.length === 0) return "Pick at least one role.";
    if (!/^\\s*(?:[-*]\\s*)?scenario\\s*:/im.test(answer.scenarios) ||
        !/^\\s*(?:[-*]\\s*)?expected\\s*:/im.test(answer.scenarios)) {
      return "Give at least one example as a \\"Scenario:\\" line followed by an \\"Expected:\\" line.";
    }
    return null;
  }

  function explain(response) {
    if (response.status === 401) return "GitHub rejected that token (401). It may be expired or mistyped — create a new fine-grained token and try again.";
    if (response.status === 403) return "That token is not allowed to open issues here (403). Check it grants Issues: Read and write.";
    if (response.status === 404) return "This repository is not visible to that token (404). Fine-grained tokens for an organisation repo need an admin to approve them, so ask the platform team — or use the GitHub form below.";
    if (response.status === 422) return "GitHub could not accept the request (422). Check every field is filled in, then try again.";
    return "GitHub returned an unexpected error (" + response.status + "). Use the GitHub form below instead.";
  }

  function announce(issue) {
    say("Request opened as ");
    var link = document.createElement("a");
    link.href = issue.html_url;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "#" + issue.number;
    status.appendChild(link);
    status.appendChild(document.createTextNode(". Watch that issue for progress."));
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var answer = answers();
    var problem = complain(answer);
    if (problem) { say(problem, "error"); return; }

    var token = String(new FormData(form).get("token") || "");
    var issue = renderRequestIssue(answer);
    button.disabled = true;
    say("Creating your request on GitHub…");

    fetch(API, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({ title: issue.title, body: issue.body, labels: issue.labels })
    }).then(function (response) {
      button.disabled = false;
      if (!response.ok) { say(explain(response), "error"); return; }
      return response.json().then(function (created) {
        form.reset();
        announce(created);
      });
    }).catch(function () {
      button.disabled = false;
      say("Could not reach GitHub. Check your connection, or use the GitHub form below.", "error");
    });
  });
})();
</script>`;
  return layout(config, `Request a skill — ${config.displayName}`, body, 0);
}

const STYLES = `:root { color-scheme: light dark; --fg: #12151a; --muted: #5b6472; --bg: #fbfbfd; --card: #fff; --line: #dfe3ea; --accent: #3d5afe; }
@media (prefers-color-scheme: dark) { :root { --fg: #e8eaf0; --muted: #9aa4b2; --bg: #14171c; --card: #1c2027; --line: #2c323c; --accent: #8fa2ff; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
header.site { display: flex; gap: 1rem; align-items: baseline; justify-content: space-between; padding: 1rem 1.5rem; border-bottom: 1px solid var(--line); }
.brand { font-weight: 700; text-decoration: none; color: var(--fg); }
nav a { margin-left: 1rem; color: var(--accent); }
main { max-width: 60rem; margin: 0 auto; padding: 1.5rem; }
h1 { margin-bottom: .25rem; }
.lede { color: var(--muted); margin-top: 0; }
#search { width: 100%; padding: .7rem .9rem; font-size: 1rem; border: 1px solid var(--line); border-radius: .5rem; background: var(--card); color: var(--fg); }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr)); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: .6rem; padding: 1rem; }
.card h3 { margin: 0 0 .35rem; font-size: 1.05rem; }
.card p { margin: .25rem 0; }
.meta { color: var(--muted); font-size: .85rem; }
.badge { display: inline-block; padding: .1rem .5rem; border: 1px solid var(--line); border-radius: 999px; font-size: .75rem; color: var(--muted); }
.filters { display: flex; flex-wrap: wrap; gap: .4rem; margin: .8rem 0 1.2rem; }
.filter { margin: 0; padding: .35rem .8rem; background: var(--card); color: var(--fg); border: 1px solid var(--line); border-radius: 999px; font-size: .85rem; }
.filter.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.badge.stale { border-color: #d08700; color: #d08700; }
pre { background: var(--card); border: 1px solid var(--line); border-radius: .5rem; padding: .8rem; overflow-x: auto; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: .3rem 1rem; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; }
.hint { color: var(--muted); font-size: .875rem; margin: .3rem 0 0; }
#status { margin-top: 1rem; }
#status.error { color: #c0392b; }
form label { display: block; margin: 1rem 0 .25rem; font-weight: 600; }
form input[type=text], form input:not([type]), form textarea { width: 100%; padding: .6rem; border: 1px solid var(--line); border-radius: .4rem; background: var(--card); color: var(--fg); font: inherit; }
fieldset { margin-top: 1rem; border: 1px solid var(--line); border-radius: .5rem; }
label.check { display: inline-block; margin-right: 1rem; font-weight: 400; }
button { margin-top: 1.25rem; padding: .6rem 1.1rem; border: 0; border-radius: .4rem; background: var(--accent); color: #fff; font-size: 1rem; cursor: pointer; }
footer { max-width: 60rem; margin: 2rem auto; padding: 1rem 1.5rem; color: var(--muted); border-top: 1px solid var(--line); font-size: .85rem; }
a { color: var(--accent); }
`;

/** The whole static catalog site, keyed by path under `dist/site`. */
export function generateSite(analysis: Analysis, config: HubConfig): Map<string, string> {
  const files = new Map<string, string>();
  files.set("dist/site/index.json", `${JSON.stringify(catalogIndex(analysis, config), null, 2)}\n`);
  files.set("dist/site/index.html", homePage(analysis, config));
  files.set("dist/site/request.html", requestPage(config));
  files.set("dist/site/styles.css", STYLES);
  for (const plugin of analysis.plugins) {
    files.set(`dist/site/plugins/${plugin.name}.html`, pluginPage(plugin, config));
  }
  files.set("dist/site/.nojekyll", "");
  return files;
}
