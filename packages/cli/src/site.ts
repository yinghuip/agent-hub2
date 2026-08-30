import { roleIcon } from "./assets.ts";
import { catalogIndex } from "./manifests.ts";
import type { Analysis, CatalogPlugin } from "./analyse.ts";
import type { QueuedRequest, RequestStage } from "./queue.ts";
import { REQUEST_SECTIONS } from "./request.ts";
import { pluginCandidates, rankSimilar, requestText } from "./similar.ts";
import { ROLES } from "./roles.ts";
import type { HubConfig } from "./schema.ts";

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const formatDate = (iso: string) => iso.slice(0, 10);

/** JSON safe to embed in a <script> element. */
const embedJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** A functional mark, not decoration: without it every page load 404s. */
function favicon(config: HubConfig): string {
  const initial = escape(config.displayName.trim().charAt(0).toUpperCase());
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" fill="%23e42300"/>` +
    `<text x="16" y="23" font-family="Helvetica,Arial,sans-serif" font-size="20" font-weight="700" ` +
    `text-anchor="middle" fill="%23ffffff">${initial}</text></svg>`;
  return `data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/"/g, "'")}`;
}

/** Pages the utility nav can mark as current. */
type NavPage = "contribute" | "request" | "requests" | null;

function layout(config: HubConfig, title: string, body: string, depth: number, current: NavPage = null): string {
  const base = depth === 0 ? "." : "..";
  const item = (page: Exclude<NavPage, null>, href: string, label: string) =>
    `<a href="${href}"${current === page ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(config.description)}">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(config.description)}">
<meta property="og:type" content="website">
<link rel="icon" href="${favicon(config)}">
<link rel="preload" as="font" type="font/woff2" href="${base}/fonts/archivo-narrow.woff2" crossorigin>
<link rel="stylesheet" href="${base}/styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site">
  <a class="brand" href="${base}/index.html">${escape(config.displayName)}</a>
  <nav class="utility" aria-label="Site">
    ${item("contribute", `${base}/contribute.html`, "Contribute")}
    ${item("request", `${base}/request.html`, "Request a skill")}
    ${item("requests", `${base}/requests.html`, "Open requests")}
    <a href="https://github.com/${escape(config.repo)}">Repository<span class="ext" aria-hidden="true"> ↗</span></a>
  </nav>
</header>
<main id="main">
${body}
</main>
<footer class="invert">
  <div class="well">
    <p class="foot-brand">${escape(config.displayName)}</p>
    <p>Generated from <code>plugins/</code> by <code>agent-hub build</code>.</p>
    <p><a href="https://github.com/${escape(config.repo)}">${escape(config.repo)}</a></p>
  </div>
</footer>
</body>
</html>
`;
}

/** Neutral, because staleness is a caution, not a second brand colour. */
const staleLabel = '<span class="stale">Stale</span>';

function tile(plugin: CatalogPlugin, index: number): string {
  const search = [plugin.name, plugin.description, plugin.ownerTeam, ...plugin.keywords, ...plugin.roles]
    .join(" ")
    .toLowerCase();
  return `<article class="tile${index === 0 ? " tile-wide" : ""}" data-name="${escape(plugin.name)}"
  data-roles="${escape(plugin.roles.join("|"))}" data-search="${escape(search)}">
  <h3><a href="./plugins/${escape(plugin.name)}.html"${
    // Search also matches keywords the card does not print; the tooltip lets a
    // reader see why a tile matched without opening it.
    plugin.keywords.length ? ` title="Keywords: ${escape(plugin.keywords.join(", "))}"` : ""
  }>${escape(plugin.name)}</a></h3>
  <p class="tile-roles">${escape(plugin.roles.join(" · "))}</p>
  <p class="desc">${escape(plugin.description)}</p>
  <dl class="strip">
    <div><dt>Version</dt><dd><code>${escape(plugin.version)}</code></dd></div>
    <div><dt>Owner</dt><dd>${escape(plugin.ownerTeam)}</dd></div>
    <div><dt>Updated</dt><dd>${formatDate(plugin.lastUpdated)}${plugin.stale ? ` ${staleLabel}` : ""}</dd></div>
  </dl>
</article>`;
}

function rail(populatedRoles: readonly string[]): string {
  return `<nav class="rail" aria-label="Filter by role">
  <button class="rail-item active" data-role-filter="" aria-pressed="true">
    ${roleIcon("General")}<span>All</span>
  </button>
  ${populatedRoles
    .map(
      (role) => `<button class="rail-item" data-role-filter="${escape(role)}" aria-pressed="false">
    ${roleIcon(role)}<span>${escape(role)}</span>
  </button>`,
    )
    .join("\n  ")}
</nav>
<label class="rail-select">Filter by role
  <select id="role-select">
    <option value="">All roles</option>
    ${populatedRoles.map((role) => `<option value="${escape(role)}">${escape(role)}</option>`).join("\n    ")}
  </select>
</label>`;
}

function homePage(analysis: Analysis, config: HubConfig): string {
  const { plugins, recentlyAdded, requests } = analysis;
  const populatedRoles = ROLES.filter((role) => plugins.some((plugin) => plugin.roles.includes(role)));
  const recent = recentlyAdded
    .map((name) => plugins.find((plugin) => plugin.name === name))
    .filter((plugin): plugin is CatalogPlugin => Boolean(plugin));
  // One tile per plugin, whatever its role count: roles are chips on the tile
  // and a filter over the sheet, never a reason to print the same card twice.
  // The lead tile earns its double span only once there is a sheet to lead.
  const catalogGrid = `<div class="grid">${plugins
    .map((plugin, index) => tile(plugin, plugins.length >= 3 ? index : index + 1))
    .join("\n")}</div>`;

  const body = `<section class="hero">
  <div class="hero-copy">
    <p class="eyebrow">Internal marketplace</p>
    <h1>${escape(config.displayName)}</h1>
    <p class="lede">${escape(config.description)}</p>
    <input id="search" type="search" placeholder="Search by name, keyword or team" autocomplete="off"
      aria-label="Search skills">
  </div>
  <aside class="hero-counts">
    <a href="#catalog"><span class="count">${plugins.length}</span><span class="count-label">Skills</span></a>
    <a href="#catalog"><span class="count">${populatedRoles.length}</span><span class="count-label">Roles</span></a>
    ${
      // Absent when the queue was not read: a missing number is honest, a 0 is a lie.
      requests
        ? `<a href="./requests.html"><span class="count">${requests.length}</span><span class="count-label">Open requests</span></a>`
        : ""
    }
  </aside>
</section>

${
  // Below three entries the reel repeats the catalog card for card, which is
  // repetition, not recency. It earns its place only once it summarises.
  recent.length >= 3
    ? `<section class="recent">
  <h2>Recently added</h2>
  <div class="reel">${recent.map((plugin, index) => tile(plugin, index + 1)).join("\n")}</div>
</section>`
    : ""
}

<section class="catalog" id="catalog">
  ${rail(populatedRoles)}
  <div class="catalog-body">
    <h2>Catalog</h2>
    <p id="result-count" class="visually-hidden" role="status" aria-live="polite"></p>
    <p id="no-results" role="status" hidden>No skills match that search.
      <button type="button" id="clear-search" class="ghost">Clear search and filter</button></p>
    ${catalogGrid}
  </div>
</section>

<section class="band invert" id="install">
  <div class="well">
    <h2>Install the marketplace once</h2>
    <div class="band-code">
      <pre><code>/plugin marketplace add ${escape(config.repo)}
/plugin install &lt;skill&gt;@${escape(config.name)}</code></pre>
      <button class="copy" type="button" aria-live="polite">Copy</button>
    </div>
    <p>Then install any skill by name. Copilot CLI reads the same commands, and every listing carries a
    universal script for tools that do not.</p>
  </div>
</section>

<section class="paths">
  <p class="eyebrow">Two ways in</p>
  <div class="paths-grid">
    <article class="path path-major">
      <h2>Contribute a skill</h2>
      <p>Add a directory under <code>plugins/</code>, write one <code>plugin.yaml</code> and your
      <code>SKILL.md</code> files, then open a pull request. CI generates every manifest.</p>
      <a class="cta" href="./contribute.html">Read the guide</a>
    </article>
    <article class="path">
      <h2>Request a skill</h2>
      <p>Describe what you need in plain language. Approved requests are drafted by an agent and land as a
      pull request with you as reviewer.</p>
      <a class="cta" href="./request.html">Open a request</a>
    </article>
  </div>
</section>

${
  // Hidden when the queue is empty or was never read, the same rule "Recently
  // added" follows: an empty section is a stub, not information.
  requests && requests.length
    ? `<section class="queue">
  <h2>Requests in flight</h2>
  <p class="desc">${
    requests.length === 1 ? "One skill has been asked for" : `${requests.length} skills have been asked for`
  } and not shipped yet. Check here before writing a request of your own.</p>
  <ul class="queue-list">${requests
    .slice(0, 4)
    .map(
      (request) => `<li class="request request-row">
    <a href="${escape(request.url)}">${escape(request.title)}</a>
    <span class="chip">${escape(STAGE_LABELS[request.stage])}</span>
  </li>`,
    )
    .join("\n")}</ul>
  <a class="cta" href="./requests.html">See all ${requests.length === 1 ? "1 request" : `${requests.length} requests`}</a>
</section>`
    : ""
}

<script id="catalog" type="application/json">${embedJson(catalogIndex(analysis, config))}</script>
<script>
(function () {
  var input = document.getElementById("search");
  var select = document.getElementById("role-select");
  var tiles = Array.prototype.slice.call(document.querySelectorAll(".tile"));
  var sections = Array.prototype.slice.call(document.querySelectorAll("section.recent"));
  var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-role-filter]"));
  var empty = document.getElementById("no-results");
  var count = document.getElementById("result-count");
  var role = "";

  function apply() {
    var terms = input.value.toLowerCase().split(/\\s+/).filter(Boolean);
    var visible = 0;
    // The reel repeats catalog tiles, so count names, not tiles.
    var names = {};
    tiles.forEach(function (tile) {
      var haystack = tile.getAttribute("data-search");
      var roles = tile.getAttribute("data-roles").split("|");
      var match = terms.every(function (term) { return haystack.indexOf(term) !== -1; }) &&
        (role === "" || roles.indexOf(role) !== -1);
      tile.hidden = !match;
      if (match) names[tile.getAttribute("data-name")] = true;
    });
    visible = Object.keys(names).length;
    sections.forEach(function (section) {
      section.hidden = section.querySelectorAll(".tile:not([hidden])").length === 0;
    });
    empty.hidden = visible !== 0;
    // Filtering is a silent change on screen, so say what happened.
    count.textContent = visible + (visible === 1 ? " skill" : " skills") +
      (role === "" ? "" : " for " + role) + " shown";
  }

  function setRole(next) {
    role = next;
    buttons.forEach(function (button) {
      var on = button.getAttribute("data-role-filter") === role;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
    if (select.value !== role) select.value = role;
    apply();
  }

  input.addEventListener("input", apply);
  select.addEventListener("change", function () { setRole(select.value); });
  // The empty state is a fork, not a wall: one press restores the full sheet.
  document.getElementById("clear-search").addEventListener("click", function () {
    input.value = "";
    setRole("");
    input.focus();
  });
  buttons.forEach(function (button) {
    button.addEventListener("click", function () { setRole(button.getAttribute("data-role-filter")); });
  });

  // The same commands the plugin pages carry, so the same copy affordance.
  Array.prototype.slice.call(document.querySelectorAll(".band-code")).forEach(function (block) {
    var button = block.querySelector(".copy");
    button.addEventListener("click", function () {
      var text = block.querySelector("code").textContent;
      navigator.clipboard.writeText(text).then(function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = "Copy"; }, 1600);
      }, function () {
        button.textContent = "Select and copy";
      });
    });
  });

  // Tiles arrive as you reach them. No scroll listener, and nothing moves under reduced motion.
  if (window.IntersectionObserver && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, index) {
        if (!entry.isIntersecting) return;
        entry.target.style.transitionDelay = (index % 6) * 60 + "ms";
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    tiles.forEach(function (tile) { tile.classList.add("reveal"); observer.observe(tile); });
  }
})();
</script>`;
  return layout(config, config.displayName, body, 0);
}

const INSTALL_TABS: { label: string; key: keyof CatalogPlugin["install"] }[] = [
  { label: "Claude Code", key: "claudeCode" },
  { label: "GitHub Copilot", key: "copilot" },
  { label: "OpenAI Codex", key: "codex" },
  { label: "Universal", key: "universal" },
];

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function pluginPage(plugin: CatalogPlugin, config: HubConfig): string {
  const body = `<article class="detail">
  <p class="crumb"><a href="../index.html#catalog">&larr; Catalog</a></p>
  <header class="detail-head">
    <h1>${escape(plugin.name)}</h1>
    ${plugin.stale ? staleLabel : ""}
    <p class="lede">${escape(plugin.description)}</p>
  </header>

  <dl class="facts">
    <div><dt>Version</dt><dd><code>${escape(plugin.version)}</code></dd></div>
    <div><dt>Owner</dt><dd>${escape(plugin.ownerTeam)} (${escape(plugin.author.name)})</dd></div>
    <div><dt>Roles</dt><dd>${plugin.roles.map((role) => escape(role)).join(", ")}</dd></div>
    <div><dt>Last updated</dt><dd>${formatDate(plugin.lastUpdated)}</dd></div>
    <div><dt>Skills</dt><dd>${plugin.skills.map((skill) => `<code>${escape(skill.name)}</code>`).join(" ")}</dd></div>
  </dl>

  <section class="install">
    <h2>Install</h2>
    <div class="tabs" role="tablist" aria-label="Install commands by tool">
      ${INSTALL_TABS.map(
        (tab, index) =>
          `<button role="tab" id="tab-${slug(tab.label)}" data-tab="${escape(tab.label)}"
        aria-controls="panel-${slug(tab.label)}" aria-selected="${index === 0 ? "true" : "false"}"
        tabindex="${index === 0 ? "0" : "-1"}" class="tab${index === 0 ? " active" : ""}">${escape(tab.label)}</button>`,
      ).join("\n      ")}
    </div>
    ${INSTALL_TABS.map(
      (tab, index) => `<div class="panel${index === 0 ? " active" : ""}" role="tabpanel"
      id="panel-${slug(tab.label)}" aria-labelledby="tab-${slug(tab.label)}" data-panel="${escape(tab.label)}"
      tabindex="0">
      <div class="panel-bar">
        <button class="copy" type="button" aria-live="polite">Copy</button>
      </div>
      <pre><code>${escape(plugin.install[tab.key])}</code></pre>
    </div>`,
    ).join("\n    ")}
  </section>

  <section class="readme">
    <h2>Readme</h2>
    <div class="prose">${plugin.readmeHtml}</div>
  </section>
</article>

<script>
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var panels = Array.prototype.slice.call(document.querySelectorAll(".panel"));

  function select(tab, moveFocus) {
    tabs.forEach(function (other) {
      var on = other === tab;
      other.classList.toggle("active", on);
      other.setAttribute("aria-selected", on ? "true" : "false");
      other.setAttribute("tabindex", on ? "0" : "-1");
    });
    panels.forEach(function (panel) {
      panel.classList.toggle("active", panel.id === tab.getAttribute("aria-controls"));
    });
    if (moveFocus) tab.focus();
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { select(tab, false); });
    // The tab strip is one tab stop; the arrows move within it.
    tab.addEventListener("keydown", function (event) {
      var next = null;
      if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
      if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (event.key === "Home") next = tabs[0];
      if (event.key === "End") next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      select(next, true);
    });
  });

  panels.forEach(function (panel) {
    var button = panel.querySelector(".copy");
    button.addEventListener("click", function () {
      var text = panel.querySelector("code").textContent;
      navigator.clipboard.writeText(text).then(function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = "Copy"; }, 1600);
      }, function () {
        button.textContent = "Select and copy";
      });
    });
  });
})();
</script>`;
  return layout(config, `${plugin.name} - ${config.displayName}`, body, 1);
}

/**
 * The contributor guide, published from the repo's own CONTRIBUTING.md so the
 * site and the repo cannot disagree about how to contribute.
 */
function contributePage(config: HubConfig, contributingHtml: string | null): string {
  const repo = `https://github.com/${escape(config.repo)}`;
  const body = `<article class="detail">
  <header class="detail-head">
    <h1>Contribute a skill</h1>
    <p class="lede">Hand-written plugins go through the same gate as generated ones.</p>
  </header>
  ${
    contributingHtml
      ? `<div class="prose">${contributingHtml}</div>
  <p class="hint">Published from <code>CONTRIBUTING.md</code> in the repository.
  <a href="${repo}">Browse the repository</a> to see it in context.</p>`
      : `<p>Add a directory under <code>plugins/</code> with one <code>plugin.yaml</code>, a README and your
  <code>SKILL.md</code> files, then open a pull request. CI generates every manifest and runs the validation
  gate.</p>
  <p class="hint">This repository has no <code>CONTRIBUTING.md</code> yet, so the full guide is not published
  here. <a href="${repo}">Browse the repository</a>.</p>`
  }
</article>`;
  return layout(config, `Contribute a skill - ${config.displayName}`, body, 0, "contribute");
}

/** Display order: the stage waiting on a human first. */
const STAGES: { stage: RequestStage; heading: string; chip: string; blurb: string }[] = [
  {
    stage: "triage",
    heading: "Needs triage",
    chip: "needs triage",
    blurb: "Waiting on a platform reviewer to decide. Add your own scenarios to one rather than filing a second.",
  },
  {
    stage: "generating",
    heading: "Approved and generating",
    chip: "generating",
    blurb: "An agent is drafting these now. Each lands as a pull request with the requester as a reviewer.",
  },
  {
    stage: "duplicate",
    heading: "Possible duplicate",
    chip: "possible duplicate",
    blurb: "An existing skill or another open request may already cover these. Nothing is closed automatically.",
  },
];

/** The chip the home band prints, from the same table the page headings come from. */
const STAGE_LABELS = Object.fromEntries(STAGES.map(({ stage, chip }) => [stage, chip])) as Record<
  RequestStage,
  string
>;

/** The live queue on GitHub, which is always the source of truth for a snapshot. */
function queueSearchUrl(config: HubConfig): string {
  return `https://github.com/${config.repo}/issues?q=${encodeURIComponent("is:issue is:open label:skill-request")}`;
}

/**
 * One open request. Every field is issue text a colleague wrote, so every field
 * goes through `escape` and none of it goes through `marked` — a rendered issue
 * body would be stored HTML from anyone who can open an issue.
 */
function requestItem(request: QueuedRequest): string {
  return `<li class="request">
  <h3><a href="${escape(request.url)}">${escape(request.title)}</a></h3>
  ${request.roles.length ? `<p class="request-roles">${escape(request.roles.join(" · "))}</p>` : ""}
  ${request.problem ? `<p class="desc">${escape(request.problem)}</p>` : ""}
  <p class="request-meta">#${escape(String(request.number))}${
    request.openedAt ? `, opened ${escape(formatDate(request.openedAt))}` : ""
  }</p>
</li>`;
}

/**
 * The open request queue.
 *
 * Always emitted, like the contribute path: a route that exists on some builds
 * only makes every link to it conditional, and 404s a local preview. What
 * changes is what it says — and "we did not read the queue" is a different
 * sentence from "the queue is empty", because a build without a token cannot
 * tell the difference and must not guess.
 */
function openRequestsPage(analysis: Analysis, config: HubConfig): string {
  const requests = analysis.requests;
  const search = escape(queueSearchUrl(config));
  const live = `<a href="${search}">the open issues on GitHub</a>`;

  let main: string;
  if (requests === null) {
    main = `<p>This build did not read the request queue, so there is nothing to list here. The catalog is
  generated without a token; the published site fetches the queue in its workflow.</p>
  <p>Browse ${live} instead. That is the live list either way.</p>`;
  } else if (requests.length === 0) {
    main = `<p>No open requests right now. Every request that has been asked for has either shipped as a skill
  or been closed.</p>
  <p><a class="cta" href="./request.html">Request a skill</a></p>`;
  } else {
    const sections = STAGES.map(({ stage, heading, blurb }) => {
      const inStage = requests.filter((request) => request.stage === stage);
      if (inStage.length === 0) return "";
      // The nbsp keeps the count with the last word, so a heading that wraps on
      // a phone does not strand the number on a line of its own.
      return `<section class="stage">
  <h2>${escape(heading)}&nbsp;<span class="stage-count">${inStage.length}</span></h2>
  <p class="hint">${escape(blurb)}</p>
  <ul class="queue-list">${inStage.map(requestItem).join("\n")}</ul>
</section>`;
    })
      .filter(Boolean)
      .join("\n");
    main = `<p>${requests.length === 1 ? "One request is" : `${requests.length} requests are`} open. Adding your
  examples to one that already exists beats filing a second: the generating agent turns every example
  into an eval it must pass.</p>
${sections}`;
  }

  const body = `<article class="detail">
  <header class="detail-head">
    <h1>Open requests</h1>
    <p class="lede">What colleagues have asked for and where each one has got to. Stages come from the issue's
    own labels, so this page and GitHub can never disagree about them.</p>
  </header>
  ${main}
  ${
    // Only a build that read the queue has a snapshot to date. The unread state
    // has already said so, and already linked the live list, in `main`.
    requests === null
      ? ""
      : `<p class="hint">A snapshot, built ${escape(formatDate(analysis.now.toISOString()))} and rebuilt whenever
  a request is opened, edited, labelled or closed. For the live list, see ${live}.</p>`
  }
</article>`;
  return layout(config, `Open requests - ${config.displayName}`, body, 0, "requests");
}

function requestPage(config: HubConfig, plugins: CatalogPlugin[], floor: number): string {
  const repo = JSON.stringify(config.repo);
  const openRequests = JSON.stringify("./requests.html");
  const body = `<article class="detail">
<header class="detail-head">
<h1>Request a skill</h1>
<p class="lede">Describe what you need in plain language. This page checks your answers, then hands them to
GitHub's own request form, so the issue opens under <strong>your own</strong> account: no token to create,
and you stay reachable for questions and get notified when the skill ships.</p>
</header>

<form id="request" novalidate>
  <p class="hint">Every field is required. Extra examples you leave blank are simply left out.</p>
  <label>Skill title<input name="title" required placeholder="PR review checklist" autocomplete="off"></label>
  <div id="similar" role="status" hidden></div>

  <fieldset aria-required="true"><legend>Which roles is this for?</legend>
    <div class="checks">
    ${ROLES.map(
      (role) => `<label class="check"><input type="checkbox" name="roles" value="${escape(role)}"> ${escape(role)}</label>`,
    ).join("\n    ")}
    </div>
  </fieldset>

  <label>What problem should this skill solve?
    <textarea name="problem" required rows="4" placeholder="What goes wrong today, and what should happen instead?"></textarea></label>

  <fieldset class="examples" aria-describedby="scenarios-hint"><legend>Example scenarios and expected results</legend>
    <p class="hint" id="scenarios-hint">Each example pairs a situation with what the skill should do about it.
    These become the criteria the generating agent checks its own work against, so be concrete.</p>
    <ol id="example-list" class="example-list">
      <li class="example">
        <div class="example-bar"><span class="example-n">Example 1</span></div>
        <label>Scenario<textarea rows="2" data-part="scenario" placeholder="A PR adds a new form field"></textarea></label>
        <label>Expected result<textarea rows="2" data-part="expected" placeholder="The skill flags the missing label"></textarea></label>
      </li>
    </ol>
    <button type="button" id="add-example" class="ghost">Add another example</button>
  </fieldset>

  <button type="submit">Continue on GitHub</button>
  <p class="hint">Opens GitHub's issue form in a new tab, prefilled with these answers. You check it over and
  press Create there; nothing is filed until you do.</p>
  <p id="status" role="status"></p>
</form>

<p class="hint">Your answers stay on this page after the hand-off, so nothing is lost if GitHub's form is
missing something. <a href="https://github.com/${escape(config.repo)}/issues/new?template=skill-request.yml"
target="_blank" rel="noopener">Open GitHub's form empty</a> if you would rather fill it in there.</p>

<script>
(function () {
  var REQUEST_SECTIONS = ${embedJson(REQUEST_SECTIONS)};
  // Emitted from the build's own table, so the fields this page prefills and the
  // ids the issue template declares cannot drift apart.

  var REPO = ${repo};
  var TEMPLATE = "skill-request.yml";
  // GitHub answers 414 once a prefill URL passes the server's limit, so stay
  // well under it and hand the overflow to the clipboard instead.
  var URL_BUDGET = 6000;
  // The ranker below sees the catalog only — a request in triage is not a
  // published skill. The queue has a page of its own, so point at that.
  var OPEN_REQUESTS = ${openRequests};

  var form = document.getElementById("request");
  var status = document.getElementById("status");
  var button = form.querySelector('button[type="submit"]');
  var similar = document.getElementById("similar");
  var exampleList = document.getElementById("example-list");
  var addExample = document.getElementById("add-example");

  // Structured pairs, composed into "Scenario: … / Expected: …" text at
  // hand-off: the requester never has to learn the line convention, and the
  // issue the agent parses still carries exactly that convention.
  function examples() {
    return Array.prototype.slice.call(exampleList.querySelectorAll(".example")).map(function (item) {
      return {
        scenario: item.querySelector('[data-part="scenario"]').value.trim(),
        expected: item.querySelector('[data-part="expected"]').value.trim()
      };
    });
  }

  function renumber() {
    var items = Array.prototype.slice.call(exampleList.querySelectorAll(".example"));
    items.forEach(function (item, index) {
      item.querySelector(".example-n").textContent = "Example " + (index + 1);
      var remove = item.querySelector(".remove");
      // The first example is the form's floor; only the ones above it detach.
      if (index === 0) {
        if (remove) remove.remove();
      } else if (!remove) {
        remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ghost remove";
        remove.textContent = "Remove";
        remove.addEventListener("click", function () {
          item.remove();
          renumber();
        });
        item.querySelector(".example-bar").appendChild(remove);
      }
      if (remove && remove.isConnected) remove.setAttribute("aria-label", "Remove example " + (index + 1));
    });
  }

  addExample.addEventListener("click", function () {
    var next = exampleList.querySelector(".example").cloneNode(true);
    Array.prototype.slice.call(next.querySelectorAll("textarea")).forEach(function (field) { field.value = ""; });
    exampleList.appendChild(next);
    renumber();
    next.querySelector('[data-part="scenario"]').focus();
  });
  renumber();

  // The catalog, and the same ranker the request bot runs, so a hint here and a
  // "possible duplicate" label two minutes later can never disagree.
  var CANDIDATES = ${embedJson(pluginCandidates(plugins, "."))};
  var FLOOR = ${floor};
  var rankSimilar = ${rankSimilar.toString()};
  var requestText = ${requestText.toString()};
  var acknowledged = false;

  function esc(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function show(html) {
    similar.innerHTML = html;
    similar.hidden = false;
  }

  function forget() {
    acknowledged = false;
    button.textContent = "Continue on GitHub";
    similar.hidden = true;
    similar.innerHTML = "";
  }

  // Matches open in a new tab: this aside invites a look elsewhere, and
  // following it must not cost the requester the answers they have typed.
  function link(url, label) {
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + label + "</a>";
  }

  /** While typing: the single closest skill, with the command that installs it. */
  function hint(query) {
    var matches = rankSimilar(query, CANDIDATES, FLOOR, 1);
    if (matches.length === 0) { similar.hidden = true; similar.innerHTML = ""; return; }
    var match = matches[0];
    show('<p class="similar-lead">This may already exist</p>' +
      "<p>" + link(match.url, esc(match.name)) + ": " + esc(match.description) + "</p>" +
      "<pre>" + esc(match.install.claudeCode) + "</pre>" +
      '<p class="hint">' + link(match.url, "Read what it does") + " before writing this one out. It opens in a new tab; your answers stay here.</p>");
  }

  form.elements.title.addEventListener("input", function () {
    hint(requestText(form.elements.title.value, ""));
  });
  // The paraphrase usually lives in the problem statement, so score again once
  // it is written — on blur, not mid-sentence.
  form.elements.problem.addEventListener("blur", function () {
    hint(requestText(form.elements.title.value, form.elements.problem.value));
  });

  function interstitial(matches) {
    var items = matches.map(function (match) {
      return "<li>" + link(match.url, esc(match.name)) + ": " + esc(match.description) +
        "<pre>" + esc(match.install.claudeCode) + "</pre></li>";
    });
    show('<p class="similar-lead">Some of this may already exist</p><ul>' + items.join("") + "</ul>" +
      '<p class="hint">Requests still waiting on triage are not in this list. ' +
      link(OPEN_REQUESTS, "See the open requests") + " too. Links open in a new tab; your answers stay here.</p>");
  }

  function say(message, kind) {
    status.textContent = message;
    status.className = kind || "";
  }

  function answers() {
    var data = new FormData(form);
    var pairs = examples().filter(function (pair) { return pair.scenario || pair.expected; });
    return {
      title: String(data.get("title") || ""),
      roles: data.getAll("roles").map(String),
      problem: String(data.get("problem") || ""),
      scenarios: pairs.map(function (pair) {
        return "Scenario: " + pair.scenario + "\\nExpected: " + pair.expected;
      }).join("\\n\\n")
    };
  }

  /**
   * One validation voice for the whole form (the form is novalidate, so the
   * browser's bubble never competes with it). Catches what the generation
   * agent's parser would reject while it is still fixable, and every fault
   * names the control to send the requester back to.
   */
  function complain(answer) {
    if (!answer.title.trim()) {
      return { message: "Give the skill a title.", control: form.elements.title };
    }
    if (answer.roles.length === 0) {
      return { message: "Pick at least one role.", control: form.querySelector('input[name="roles"]') };
    }
    if (!answer.problem.trim()) {
      return { message: "Say what problem the skill should solve.", control: form.elements.problem };
    }
    var items = Array.prototype.slice.call(exampleList.querySelectorAll(".example"));
    var touched = 0;
    for (var index = 0; index < items.length; index += 1) {
      var scenario = items[index].querySelector('[data-part="scenario"]');
      var expected = items[index].querySelector('[data-part="expected"]');
      if (!scenario.value.trim() && !expected.value.trim()) continue;
      touched += 1;
      if (!scenario.value.trim()) {
        return { message: "Example " + (index + 1) + " has an expected result but no scenario.", control: scenario };
      }
      if (!expected.value.trim()) {
        return { message: "Example " + (index + 1) + " has a scenario but no expected result.", control: expected };
      }
    }
    if (touched === 0) {
      return {
        message: "Give at least one example: a scenario and its expected result.",
        control: exampleList.querySelector('[data-part="scenario"]')
      };
    }
    return null;
  }

  /** Say what is wrong, mark the control, and take the requester to it. */
  function fail(fault) {
    say(fault.message, "error");
    var control = fault.control;
    if (control.type !== "checkbox") {
      control.setAttribute("aria-invalid", "true");
      control.addEventListener("input", function () { control.removeAttribute("aria-invalid"); }, { once: true });
    }
    control.focus();
    control.scrollIntoView({ block: "center" });
  }

  /**
   * The template's own field ids carry the answers over. Labels come from the
   * template rather than a "labels" parameter, which would need the requester
   * to hold label permission on the repository.
   */
  function issueUrl(answer, omit) {
    var values = {
      title: answer.title,
      roles: answer.roles.join(", "),
      problem: answer.problem,
      scenarios: answer.scenarios
    };
    var params = new URLSearchParams({ template: TEMPLATE, title: "Skill request: " + answer.title });
    REQUEST_SECTIONS.forEach(function (section) {
      if (section.field !== omit) params.set(section.param, values[section.field]);
    });
    return "https://github.com/" + REPO + "/issues/new?" + params.toString();
  }

  /**
   * Scenarios is the only answer long enough to blow the URL budget, so carry
   * everything else in the link and put that one on the clipboard.
   */
  function handOverLongScenarios(answer) {
    var paste = "Your scenarios were too long to carry in the link, so they are on your clipboard. " +
      "Paste them into \\"Example scenarios and expected results\\" on GitHub.";
    var manual = "Your scenarios were too long to carry in the link, and this browser would not let the " +
      "page copy them. Copy your examples above yourself and paste them into that field on GitHub.";
    var copied = null;
    try {
      copied = navigator.clipboard.writeText(answer.scenarios);
    } catch (error) {
      copied = null;
    }
    if (copied && copied.then) {
      copied.then(function () { say(paste); }).catch(function () { say(manual, "error"); });
    } else {
      say(manual, "error");
    }
    window.open(issueUrl(answer, "scenarios"), "_blank", "noopener");
  }

  function handOff(answer) {
    var url = issueUrl(answer, null);
    if (url.length > URL_BUDGET) { handOverLongScenarios(answer); return; }
    window.open(url, "_blank", "noopener");
    say("Opened on GitHub in a new tab. Check it over and press Create. Your answers are still here.");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var answer = answers();
    var fault = complain(answer);
    if (fault) { fail(fault); return; }

    // Never a block: the GitHub form below would sidestep one anyway, and a
    // wrong match that stops a real request costs more than a duplicate issue.
    if (!acknowledged) {
      var matches = rankSimilar(requestText(answer.title, answer.problem), CANDIDATES, FLOOR, 3);
      if (matches.length > 0) {
        acknowledged = true;
        interstitial(matches);
        button.textContent = "Continue anyway";
        say("Look at these first. The button now takes your request to GitHub as written.");
        // The warning renders beside the title field, a screen away from the
        // button that raised it: go there, or it was never said.
        similar.scrollIntoView({ block: "center" });
        var first = similar.querySelector("a");
        if (first) first.focus();
        return;
      }
    }

    handOff(answer);
    forget();
  });
})();
</script>`;
  return layout(config, `Request a skill - ${config.displayName}`, `${body}
</article>`, 0, "request");
}

const STYLES = `@font-face {
  font-family: "Archivo Narrow Variable";
  font-style: normal;
  font-display: swap;
  font-weight: 400 700;
  src: url("./fonts/archivo-narrow.woff2") format("woff2-variations");
}
@font-face {
  font-family: "Geist Variable";
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url("./fonts/geist.woff2") format("woff2-variations");
}
@font-face {
  font-family: "Geist Mono Variable";
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url("./fonts/geist-mono.woff2") format("woff2-variations");
}

/* Tokens read off bridgestone.com.sg: accent rgb(228, 35, 0), cool neutral ramp, zero radius. */
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --surface: #f7f7f7;
  --line: #dfdfe0;
  --line-ui: #8d8d8d;
  --fg: #222326;
  --muted: #5a5a5a;
  --accent: #e42300;
  --accent-fg: #c11d00;
  --accent-down: #c11d00; /* hover/pressed fill, same in both modes */
  --on-accent: #ffffff;
  --invert-bg: #141416;
  --invert-fg: #f2f2f3;
  --invert-muted: #a0a1a5;
  --invert-line: #34363a;
  --display: "Archivo Narrow Variable", ui-sans-serif, system-ui, sans-serif;
  --body: "Geist Variable", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --mono: "Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace;
  --well: 1400px;
  --gutter: clamp(1rem, 4vw, 3rem);
  --rail: 76px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #141416;
    --surface: #1c1d20;
    --line: #34363a;
    --line-ui: #6e7075;
    --fg: #f2f2f3;
    --muted: #a0a1a5;
    --accent-fg: #ff5a2e;
    --invert-bg: #f7f7f7;
    --invert-fg: #222326;
    --invert-muted: #5a5a5a;
    --invert-line: #dfdfe0;
  }
}

* { box-sizing: border-box; }
/* The hero counts jump to in-page anchors; the glide says "same page". */
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
/* The footer belongs at the bottom of the viewport even when the page is
   short: a footer floating mid-screen over bare ground reads as a broken page. */
body {
  margin: 0;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--fg);
  font: 400 16px/1.55 var(--body);
  -webkit-font-smoothing: antialiased;
}
main { flex: 1; }
a { color: var(--accent-fg); }
code, pre { font-family: var(--mono); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

h1, h2, h3, .eyebrow, .count, .brand, .rail-item span, .tab, .cta, .count-label {
  font-family: var(--display);
  text-transform: uppercase;
}
h1, h2, h3 { font-weight: 700; letter-spacing: -0.01em; line-height: 1.05; margin: 0; }
h1 { font-size: clamp(2.75rem, 1.6rem + 4.4vw, 5rem); }
/* A clear step below the h1: section heads structure the page, they do not compete with its title. */
h2 { font-size: clamp(1.5rem, 1.15rem + 1.3vw, 2.125rem); }
h3 { font-size: 1.25rem; }
.eyebrow {
  font-size: .75rem;
  letter-spacing: .14em;
  color: var(--muted);
  margin: 0 0 .75rem;
}
.lede { color: var(--muted); max-width: 68ch; margin: 1rem 0 0; }

/* Header: one line, capped height. */
header.site {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  height: 72px;
  padding: 0 var(--gutter);
  border-bottom: 1px solid var(--line);
}
.brand { font-family: var(--display); font-weight: 700; font-size: 1.35rem; letter-spacing: .02em; text-decoration: none; color: var(--fg); }
.utility { display: flex; flex-wrap: wrap; gap: .25rem 1.5rem; font-size: .875rem; }
.utility a { color: var(--fg); text-decoration: none; border-bottom: 2px solid transparent; padding-bottom: 2px; white-space: nowrap; }
.utility a:hover, .utility a[aria-current="page"] { border-bottom-color: var(--accent); }
.ext { color: var(--muted); }

main { display: block; }
section { padding-block: clamp(3rem, 6vw, 6rem); padding-inline: var(--gutter); max-width: var(--well); margin: 0 auto; }
.well { max-width: var(--well); margin: 0 auto; padding-inline: var(--gutter); }

/* Hero: asymmetric split, headline plus subtext plus search, nothing else. */
.hero { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: clamp(2rem, 5vw, 4rem); align-items: end; padding-top: clamp(2rem, 5vw, 6rem); }
#search {
  width: 100%;
  margin-top: 2rem;
  padding: .9rem 1rem;
  font: 400 1rem var(--body);
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--line-ui);
  border-radius: 0;
}
/* The counts are doors, not ornaments: each one goes where its number lives. */
.hero-counts { display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); }
.hero-counts a { background: var(--accent); color: var(--on-accent); text-decoration: none; padding: 1.25rem 1.5rem; display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; transition: background-color 180ms; }
.hero-counts a:hover { background: var(--accent-down); }
.count { font-size: 2.5rem; font-weight: 700; line-height: 1; }
.count-label { font-size: .75rem; letter-spacing: .14em; }

/* Recently added: a reel, so it is not a second grid. */
.reel { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(19rem, 22rem); justify-content: start; gap: 1rem; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: .5rem; }
.reel .tile { scroll-snap-align: start; }
.recent h2, .catalog-body h2, .queue h2, .stage h2 { border-bottom: 2px solid var(--fg); padding-bottom: .5rem; margin-bottom: 1.5rem; }

/* Catalog: rail plus one ruled sheet of tiles. */
.catalog { display: grid; grid-template-columns: var(--rail) minmax(0, 1fr); gap: clamp(1.5rem, 3vw, 3rem); align-items: start; }
.rail { position: sticky; top: 1.5rem; display: grid; gap: 1px; background: var(--invert-line); border: 1px solid var(--invert-line); }
.rail-item {
  display: grid;
  justify-items: center;
  gap: .35rem;
  padding: .85rem .25rem;
  background: var(--invert-bg);
  color: var(--invert-muted);
  border: 0;
  border-left: 4px solid transparent;
  border-radius: 0;
  font-size: .5625rem;
  letter-spacing: .08em;
  line-height: 1.15;
  text-align: center;
  cursor: pointer;
}
.rail-item:hover { color: var(--invert-fg); }
.rail-item.active { color: var(--invert-fg); border-left-color: var(--accent); }
.rail-select { display: none; }
.catalog-body { min-width: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); gap: 1px; }

/* Tiles read as one ruled sheet: gap is the rule, the background is the ink. */
.tile { position: relative; background: var(--bg); padding: 1.25rem 1.5rem 1.5rem; border-left: 4px solid transparent; outline: 1px solid var(--line); transition: border-color 180ms cubic-bezier(0.16, 1, 0.3, 1); }
.tile:hover { border-left-color: var(--accent); }
.tile h3 a { color: var(--fg); text-decoration: none; }
.tile h3 a::after { content: ""; position: absolute; inset: 0; }
.tile:hover h3 a { color: var(--accent-fg); }
.tile-roles { font-family: var(--display); text-transform: uppercase; font-size: .625rem; letter-spacing: .12em; color: var(--muted); margin: .35rem 0 0; }
.desc { color: var(--muted); font-size: .9375rem; margin: .5rem 0 1.25rem; }
@media (min-width: 1024px) { .tile-wide { grid-column: span 2; } }

/* Metadata as columns, not a run of separator dots. */
.strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin: 0; padding-top: 1rem; border-top: 1px solid var(--line); }
.strip dt { font-family: var(--display); text-transform: uppercase; font-size: .625rem; letter-spacing: .12em; color: var(--muted); }
.strip dd { margin: .25rem 0 0; font-size: .8125rem; }
.stale, .chip { display: inline-block; margin-left: .35rem; padding: 0 .35rem; border: 1px solid var(--line-ui); font-family: var(--display); text-transform: uppercase; font-size: .625rem; letter-spacing: .1em; color: var(--muted); }

/* Open requests: a ruled list, so it is neither a grid nor a reel. Stage chips
   stay neutral — the one accent is reserved for interactive moments. */
.queue-list { list-style: none; margin: 1.5rem 0 0; padding: 0; border-top: 1px solid var(--line); }
.request { padding: 1rem 0; border-bottom: 1px solid var(--line); }
.request h3 { font-size: 1.0625rem; }
.request h3 a, .request-row a { color: var(--fg); text-decoration: none; }
.request h3 a:hover, .request-row a:hover { color: var(--accent-fg); }
.request .desc { margin: .5rem 0 0; max-width: 68ch; }
.request-roles { font-family: var(--display); text-transform: uppercase; font-size: .625rem; letter-spacing: .12em; color: var(--muted); margin: .35rem 0 0; }
.request-meta { font-size: .8125rem; color: var(--muted); margin: .5rem 0 0; }
.request-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; }
.chip { margin-left: 0; white-space: nowrap; }
/* A count badge, not a subscript: it sits beside the heading at chip scale. */
.stage-count { display: inline-block; vertical-align: middle; font-size: .4em; letter-spacing: .06em; color: var(--muted); border: 1px solid var(--line-ui); padding: .15em .6em; }
.stage { padding: 0 0 clamp(1.5rem, 3vw, 2.5rem); max-width: none; }
.stage .hint { margin: -1rem 0 0; }
.queue .cta { margin-top: 1.5rem; }

/* Inverted bands: the page's two moments of scale. */
.invert { background: var(--invert-bg); color: var(--invert-fg); max-width: none; }
.band pre { background: transparent; border: 0; padding: 0; margin: 1.5rem 0; font-size: clamp(1rem, .8rem + .6vw, 1.25rem); overflow-x: auto; }
.band-code { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.band .copy { background: transparent; color: var(--invert-fg); border-color: var(--invert-line); margin-top: 1.5rem; }
.band h2 { color: var(--invert-fg); }
.band p { color: var(--invert-muted); max-width: 60ch; }
footer.invert { padding-block: 3rem; font-size: .875rem; }
footer .well { display: grid; gap: .35rem; }
footer p { margin: 0; color: var(--invert-muted); }
footer a { display: inline-block; padding: .25rem 0; }
.foot-brand { font-family: var(--display); text-transform: uppercase; font-weight: 700; color: var(--invert-fg); font-size: 1.1rem; }
footer a { color: var(--invert-fg); }

/* Two paths: a 60/40 split, not three equal cards. */
.paths-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 1px; background: var(--line); border: 1px solid var(--line); }
/* CTAs sit on one line across the split, however long each path's copy runs. */
.path { background: var(--bg); padding: clamp(1.5rem, 3vw, 2.5rem); display: flex; flex-direction: column; align-items: flex-start; }
.path p { color: var(--muted); max-width: 52ch; margin-bottom: 1.5rem; }
.path .cta { margin-top: auto; }
/* The one primary-action recipe, link or button. */
.cta, button[type="submit"] {
  display: inline-block;
  margin-top: 1.5rem;
  padding: .8rem 1.5rem;
  background: var(--accent);
  color: var(--on-accent);
  border: 0;
  border-radius: 0;
  cursor: pointer;
  text-decoration: none;
  font: 700 .8125rem var(--display);
  text-transform: uppercase;
  letter-spacing: .12em;
  white-space: nowrap;
}
.cta:hover, button[type="submit"]:hover { background: var(--accent-down); }
.cta:active, button[type="submit"]:active { transform: translateY(1px); }

/* Plugin detail. */
/* Detail pages are not <section>, so they carry the well and gutter themselves. */
.detail { max-width: 68rem; margin: 0 auto; padding: clamp(2.5rem, 5vw, 4rem) var(--gutter); width: 100%; }
.crumb { margin: 0 0 1.5rem; font-family: var(--display); text-transform: uppercase; font-size: .75rem; letter-spacing: .1em; }
.crumb a { color: var(--muted); text-decoration: none; }
.crumb a:hover { color: var(--accent-fg); }
.detail-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .75rem; }
.detail-head .lede { flex-basis: 100%; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: 0; margin: 2.5rem 0; border-top: 1px solid var(--line); }
.facts > div { display: grid; gap: .35rem; padding: 1rem 1.25rem 1rem 0; border-bottom: 1px solid var(--line); }
.facts dt { font-family: var(--display); text-transform: uppercase; font-size: .625rem; letter-spacing: .12em; color: var(--muted); }
.facts dd { margin: 0; font-size: .9375rem; }
.tabs { display: flex; gap: 1px; overflow-x: auto; scrollbar-width: thin; background: var(--line); border: 1px solid var(--line); border-bottom: 0; }
.tab { flex: 1 0 auto; scroll-snap-align: start; padding: .75rem 1rem; background: var(--bg); color: var(--muted); border: 0; border-top: 3px solid transparent; border-radius: 0; font-size: .75rem; letter-spacing: .1em; font-weight: 700; cursor: pointer; white-space: nowrap; }
.tab.active { color: var(--fg); border-top-color: var(--accent); }
.panel { display: none; border: 1px solid var(--line); padding: 1.25rem; background: var(--surface); }
.panel.active { display: block; }
.panel pre { margin: 0; overflow-x: auto; font-size: .875rem; }
/* The command is the point of the page: nothing overlaps it. */
.panel-bar { display: flex; justify-content: flex-end; margin-bottom: .85rem; }
/* The one secondary-action recipe: outlined, micro caps, zero radius. */
.copy, .ghost { padding: .45rem .9rem; background: var(--bg); color: var(--fg); border: 1px solid var(--line-ui); border-radius: 0; font: 700 .6875rem var(--display); text-transform: uppercase; letter-spacing: .1em; cursor: pointer; }
.copy:hover, .ghost:hover { border-color: var(--fg); }
.prose { max-width: 68ch; }
.prose h1, .prose h2, .prose h3 { margin: 2rem 0 .75rem; }
.prose h1 { font-size: 1.75rem; }
.prose h2 { font-size: 1.35rem; }
.prose h3 { font-size: 1.1rem; }
.prose code { background: var(--surface); padding: .1rem .3rem; font-size: .875em; }
.prose pre { background: var(--surface); border: 1px solid var(--line); padding: 1rem; overflow-x: auto; }
.prose pre code { background: none; padding: 0; }

/* Forms: every perceivable border clears 3:1. */
form label { display: block; margin: 1.5rem 0 .35rem; font-family: var(--display); text-transform: uppercase; font-size: .75rem; letter-spacing: .1em; }
form input, form textarea, form select {
  width: 100%;
  padding: .75rem;
  font: 400 1rem var(--body);
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--line-ui);
  border-radius: 0;
}
/* Fieldsets speak the same language as single fields: the group label sits
   above the group, never notched into a border. */
fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
legend { float: left; width: 100%; padding: 0; margin: 1.5rem 0 .35rem; }
/* The floated legend moves line boxes, not border boxes: without the clear,
   the group's border climbs up behind the label and swallows it. */
legend + * { clear: both; }
.checks { border: 1px solid var(--line-ui); background: var(--surface); padding: 1rem 1.25rem .5rem; }

/* Examples: structured pairs, so the Scenario:/Expected: convention is the
   page's job, never the requester's. Each example takes the detail page's
   panel recipe: a surface with its fields on the page ground. */
.examples .hint { margin: 0 0 .75rem; }
.example-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1rem; }
.example { background: var(--surface); border: 1px solid var(--line); padding: 1rem 1.25rem 1.25rem; }
.example label { margin: .9rem 0 .35rem; font-size: .6875rem; letter-spacing: .12em; color: var(--muted); }
.example textarea { background: var(--bg); resize: vertical; }
.example-bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 1.75rem; }
.example-n { font-family: var(--display); text-transform: uppercase; font-size: .6875rem; letter-spacing: .12em; color: var(--fg); font-weight: 700; }
#add-example { margin-top: 1rem; }
legend { font-family: var(--display); text-transform: uppercase; font-size: .75rem; letter-spacing: .1em; }
label.check { display: inline-flex; align-items: center; gap: .4rem; margin: 0 1.25rem .5rem 0; font-family: var(--body); text-transform: none; letter-spacing: 0; font-size: .9375rem; }
/* Native checks are too small a target beside 1rem inputs; scale and tint them. */
label.check input { width: 1.15rem; height: 1.15rem; accent-color: var(--accent); }
form button[type="submit"] { margin-top: 2rem; }
button[disabled] { opacity: .6; cursor: progress; }
.hint { color: var(--muted); font-size: .8125rem; margin: .4rem 0 0; max-width: 60ch; }
/* The duplicate warning: an aside beside the field, never a blocking dialog. */
#similar { margin-top: .75rem; padding: 1rem 1.25rem; background: var(--surface); border-left: 3px solid var(--accent); max-width: 68ch; }
#similar p { margin: 0 0 .5rem; font-size: .9375rem; }
#similar ul { margin: 0; padding-left: 1.1rem; }
#similar li { margin-bottom: .75rem; font-size: .9375rem; }
#similar pre { margin: .5rem 0 0; padding: .6rem .75rem; background: var(--bg); border: 1px solid var(--line); overflow-x: auto; font-size: .8125rem; }
.similar-lead { font: 700 .6875rem var(--display); text-transform: uppercase; letter-spacing: .12em; color: var(--muted); }
#status { margin-top: 1.25rem; max-width: 68ch; }
/* Errors share the duplicate warning's vocabulary: an accent-ruled aside. */
#status.error { color: var(--accent-fg); padding: .75rem 1.25rem; background: var(--surface); border-left: 3px solid var(--accent); }
/* The fault the status names, marked at the field itself. Cleared on input. */
form [aria-invalid="true"] { border-color: var(--accent); }
#no-results { color: var(--muted); }
.icon { display: block; }
.skip { position: absolute; left: -9999px; top: 0; z-index: 10; padding: .75rem 1rem; background: var(--accent); color: var(--on-accent); font: 700 .8125rem var(--display); text-transform: uppercase; letter-spacing: .1em; }
.skip:focus { left: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
::placeholder { color: var(--muted); opacity: 1; }

/* Motion: entry and reveal only, and only when it is welcome. */
.reveal { opacity: 0; transform: translateY(8px); transition: opacity 400ms cubic-bezier(0.16, 1, 0.3, 1), transform 400ms cubic-bezier(0.16, 1, 0.3, 1), border-color 180ms; }
.reveal.in { opacity: 1; transform: none; }

@media (max-width: 1023px) {
  .catalog { grid-template-columns: minmax(0, 1fr); }
  .rail { display: none; }
  .rail-select { display: block; margin-bottom: 1.5rem; font-family: var(--display); text-transform: uppercase; font-size: .75rem; letter-spacing: .1em; }
  .rail-select select { margin-top: .35rem; }
}
@media (max-width: 767px) {
  .hero, .paths-grid { grid-template-columns: minmax(0, 1fr); }
  .hero-counts a { padding: 1rem 1.25rem; }
  .grid { grid-template-columns: minmax(0, 1fr); }
  header.site { height: auto; padding-block: .75rem; flex-wrap: wrap; }
  /* One scrollable row, like the install tab strip, instead of a stack of
     wrapped rows eating a third of the first screen. */
  .utility { flex-basis: 100%; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; gap: 1rem; font-size: .8125rem; padding-bottom: 2px; }
  .utility::-webkit-scrollbar { display: none; }
  .strip { grid-template-columns: minmax(0, 1fr); gap: .5rem; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
  .reveal { opacity: 1; transform: none; }
}
`;

/** The whole static catalog site, keyed by path under `dist/site`. */
export function generateSite(analysis: Analysis, config: HubConfig): Map<string, string> {
  const files = new Map<string, string>();
  files.set("dist/site/index.json", `${JSON.stringify(catalogIndex(analysis, config), null, 2)}\n`);
  files.set("dist/site/index.html", homePage(analysis, config));
  files.set("dist/site/request.html", requestPage(config, analysis.plugins, config.similarityFloor));
  // Always emitted, whether or not this build read the queue; see openRequestsPage.
  files.set("dist/site/requests.html", openRequestsPage(analysis, config));
  // Always emitted: the contribute path exists whether or not a guide file does.
  files.set("dist/site/contribute.html", contributePage(config, analysis.contributingHtml));
  files.set("dist/site/styles.css", STYLES);
  for (const plugin of analysis.plugins) {
    files.set(`dist/site/plugins/${plugin.name}.html`, pluginPage(plugin, config));
  }
  files.set("dist/site/.nojekyll", "");
  return files;
}
