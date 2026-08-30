import type { Analysis, CatalogPlugin } from "./analyse.ts";
import { ROLES } from "./roles.ts";
import type { HubConfig } from "./schema.ts";

export const AGENT_PLUGINS_SCHEMA = "https://agent-plugins.org/schema/v1.0.0/plugin.json";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const dropUndefined = <T extends Record<string, unknown>>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

/** The agent-plugins.org v1.0.0 manifest read by Copilot and Codex. */
export function agentPluginsManifest(plugin: CatalogPlugin) {
  return dropUndefined({
    $schema: AGENT_PLUGINS_SCHEMA,
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    author: plugin.author,
    keywords: plugin.keywords,
  });
}

/** The Claude Code plugin manifest, from the same canonical metadata. */
export function claudeManifest(plugin: CatalogPlugin) {
  return dropUndefined({
    name: plugin.name,
    description: plugin.description,
    version: plugin.version,
    author: plugin.author,
    keywords: plugin.keywords,
  });
}

/** Generated files that live in the repo and are checked for drift in CI. */
export function generateManifests(config: HubConfig, plugins: CatalogPlugin[]): Map<string, string> {
  const files = new Map<string, string>();

  for (const plugin of plugins) {
    files.set(`${plugin.path}/plugin.json`, json(agentPluginsManifest(plugin)));
    files.set(`${plugin.path}/.claude-plugin/plugin.json`, json(claudeManifest(plugin)));
  }

  files.set(
    ".claude-plugin/marketplace.json",
    json({
      name: config.name,
      owner: config.owner,
      metadata: { description: config.description, version: "1.0.0" },
      plugins: plugins.map((plugin) => ({
        name: plugin.name,
        source: `./${plugin.path}`,
        description: plugin.description,
        version: plugin.version,
        author: plugin.author,
        keywords: plugin.keywords,
      })),
    }),
  );

  files.set(
    ".github/copilot/marketplace.json",
    json({
      $schema: AGENT_PLUGINS_SCHEMA,
      name: config.name,
      description: config.description,
      plugins: plugins.map((plugin) => ({
        name: plugin.name,
        source: `./${plugin.path}`,
        description: plugin.description,
        version: plugin.version,
      })),
    }),
  );

  return files;
}

export function catalogIndex(analysis: Analysis, config: HubConfig) {
  return {
    generatedAt: analysis.now.toISOString(),
    site: {
      name: config.name,
      displayName: config.displayName,
      description: config.description,
      repo: config.repo,
      siteUrl: config.siteUrl,
    },
    roles: [...ROLES],
    recentlyAdded: analysis.recentlyAdded,
    plugins: analysis.plugins,
  };
}

// ---------------------------------------------------------------- site

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatDate = (iso: string) => iso.slice(0, 10);

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
  return `<article class="card" data-search="${escape(
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
<p id="no-results" hidden>No skills match that search.</p>
${
  recent.length
    ? `<section class="recent"><h2>Recently added</h2><div class="grid">${recent.map(card).join("\n")}</div></section>`
    : ""
}
${roleSections}
<script id="catalog" type="application/json">${JSON.stringify(catalogIndex(analysis, config)).replace(
    /</g,
    "\\u003c",
  )}</script>
<script>
(function () {
  var input = document.getElementById("search");
  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var sections = Array.prototype.slice.call(document.querySelectorAll("section"));
  var empty = document.getElementById("no-results");
  input.addEventListener("input", function () {
    var terms = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
    var visible = 0;
    cards.forEach(function (card) {
      var haystack = card.getAttribute("data-search");
      var match = terms.every(function (term) { return haystack.indexOf(term) !== -1; });
      card.hidden = !match;
      if (match) visible++;
    });
    sections.forEach(function (section) {
      section.hidden = section.querySelectorAll(".card:not([hidden])").length === 0;
    });
    empty.hidden = visible !== 0;
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
  const body = `<h1>Request a skill</h1>
<p class="lede">Describe what you need in plain language. Submitting opens a GitHub issue under
<strong>your own</strong> GitHub account, so you stay in the loop and get notified when the skill ships.</p>
<form id="request">
  <label>Skill title<input name="skill-title" required placeholder="PR review checklist"></label>
  <fieldset><legend>Which roles is this for?</legend>
    ${ROLES.map(
      (role) => `<label class="check"><input type="checkbox" name="roles" value="${escape(role)}"> ${escape(role)}</label>`,
    ).join("\n    ")}
  </fieldset>
  <label>What problem should this skill solve?<textarea name="problem" required rows="4"></textarea></label>
  <label>Example scenarios and expected results
    <textarea name="scenarios" required rows="6" placeholder="Scenario: A PR adds a new form field&#10;Expected: The skill flags the missing label"></textarea></label>
  <label>Your team<input name="team" required></label>
  <button type="submit">Open the request on GitHub</button>
</form>
<script>
document.getElementById("request").addEventListener("submit", function (event) {
  event.preventDefault();
  var form = new FormData(event.target);
  var roles = form.getAll("roles").join(", ");
  var params = new URLSearchParams({
    template: "skill-request.yml",
    title: "Skill request: " + form.get("skill-title"),
    "skill-title": form.get("skill-title"),
    roles: roles,
    problem: form.get("problem"),
    scenarios: form.get("scenarios"),
    team: form.get("team")
  });
  window.open("https://github.com/${escape(config.repo)}/issues/new?" + params.toString(), "_blank", "noopener");
});
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
.badge.stale { border-color: #d08700; color: #d08700; }
pre { background: var(--card); border: 1px solid var(--line); border-radius: .5rem; padding: .8rem; overflow-x: auto; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: .3rem 1rem; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; }
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
