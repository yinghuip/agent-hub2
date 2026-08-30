import { readFile, readdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build, rankSimilar } from "../src/index.ts";
import { CONFIG, codeownersFor, pluginYaml, read, readJson, validTree, writeTree } from "./helpers.ts";

const NOW = new Date("2025-06-01T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

/** Age every hand-authored file in a plugin, which is what freshness reads. */
async function touchPlugin(root: string, plugin: string, when: Date): Promise<void> {
  const dir = join(root, "plugins", plugin);
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) await utimes(join(entry.parentPath, entry.name), when, when);
  }
}

describe("build", () => {
  it("emits an agent-plugins.org manifest per plugin", async () => {
    const root = await writeTree(validTree());
    const result = await build({ root, now: NOW });

    expect(result.errors).toEqual([]);
    expect(await readJson(root, "plugins/pr-review/plugin.json")).toEqual({
      $schema: "https://agent-plugins.org/schema/v1.0.0/plugin.json",
      name: "pr-review",
      description: "Reviews pull requests against the team checklist.",
      version: "1.2.0",
      author: { name: "Web Team", email: "web@acme.example" },
      keywords: ["review", "pull-request"],
    });
  });

  it("emits a Claude Code manifest per plugin from the same metadata", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });

    expect(await readJson(root, "plugins/pr-review/.claude-plugin/plugin.json")).toEqual({
      name: "pr-review",
      description: "Reviews pull requests against the team checklist.",
      version: "1.2.0",
      author: { name: "Web Team", email: "web@acme.example" },
      keywords: ["review", "pull-request"],
    });
  });

  it("emits repo-level marketplace files for Claude Code and Copilot", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });

    const claude = await readJson(root, ".claude-plugin/marketplace.json");
    expect(claude.name).toBe("agent-hub");
    expect(claude.owner).toEqual({ name: "Platform Team", email: "platform@acme.example" });
    expect(claude.plugins).toEqual([
      {
        name: "pr-review",
        source: "./plugins/pr-review",
        description: "Reviews pull requests against the team checklist.",
        version: "1.2.0",
        author: { name: "Web Team", email: "web@acme.example" },
        keywords: ["review", "pull-request"],
      },
    ]);

    const copilot = await readJson(root, ".github/copilot/marketplace.json");
    expect(copilot.name).toBe("agent-hub");
    expect(copilot.plugins).toEqual([
      {
        name: "pr-review",
        source: "./plugins/pr-review",
        description: "Reviews pull requests against the team checklist.",
        version: "1.2.0",
      },
    ]);
  });

  it("renames everything from the single config point", async () => {
    const config = JSON.parse(CONFIG);
    const root = await writeTree(
      validTree({
        "agent-hub.config.json": JSON.stringify({ ...config, name: "skill-depot", displayName: "Skill Depot" }),
      }),
    );
    await build({ root, now: NOW });

    expect((await readJson(root, ".claude-plugin/marketplace.json")).name).toBe("skill-depot");
    expect((await readJson(root, ".github/copilot/marketplace.json")).name).toBe("skill-depot");
    const index = await readJson(root, "dist/site/index.json");
    expect(index.site.name).toBe("skill-depot");
    expect(index.site.displayName).toBe("Skill Depot");
    expect(await read(root, "dist/site/index.html")).toContain("Skill Depot");
  });

  it("writes a catalog index carrying everything a listing shows", async () => {
    const root = await writeTree(validTree());
    await touchPlugin(root, "pr-review", days(10));
    await build({ root, now: NOW });

    const index = await readJson(root, "dist/site/index.json");
    expect(index.roles).toEqual([
      "Developer",
      "QA",
      "Business Analyst",
      "Product Owner",
      "Scrum Master",
      "UX Designer",
      "General",
    ]);
    const plugin = index.plugins[0];
    expect(plugin).toMatchObject({
      name: "pr-review",
      description: "Reviews pull requests against the team checklist.",
      version: "1.2.0",
      ownerTeam: "web",
      author: { name: "Web Team", email: "web@acme.example" },
      roles: ["Developer", "QA"],
      keywords: ["review", "pull-request"],
      path: "plugins/pr-review",
      stale: false,
    });
    expect(plugin.lastUpdated).toBe(days(10).toISOString());
    expect(plugin.readmeHtml).toContain("<strong>checklist</strong>");
    expect(plugin.skills).toEqual([
      { name: "review-pr", description: "Walk a pull request against the team checklist." },
    ]);
  });

  it("gives every plugin per-tool install commands including a universal fallback", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });

    const { install } = (await readJson(root, "dist/site/index.json")).plugins[0];
    expect(install.claudeCode).toContain("/plugin marketplace add acme/agent-hub");
    expect(install.claudeCode).toContain("/plugin install pr-review@agent-hub");
    // Copilot CLI reads the same marketplace format, so it takes the same commands.
    expect(install.copilot).toBe(install.claudeCode);
    expect(install.codex).toContain("pr-review");
    expect(install.universal).toContain("install.sh");
    expect(install.universal).toContain("pr-review");
  });

  it("badges plugins untouched for six months as stale", async () => {
    const root = await writeTree(validTree());
    await touchPlugin(root, "pr-review", days(200));
    await build({ root, now: NOW });

    const plugin = (await readJson(root, "dist/site/index.json")).plugins[0];
    expect(plugin.stale).toBe(true);
    expect(await read(root, "dist/site/plugins/pr-review.html")).toContain("Stale");
  });

  it("lists the newest plugins under recentlyAdded, newest first", async () => {
    const tree = validTree({
      CODEOWNERS: codeownersFor("pr-review", "flaky-triage"),
      "plugins/flaky-triage/plugin.yaml": pluginYaml({ name: "flaky-triage", roles: ["QA"] }),
      "plugins/flaky-triage/README.md": "# Flaky triage\n",
      "plugins/flaky-triage/skills/triage-flakes/SKILL.md":
        "---\nname: triage-flakes\ndescription: Triage a flaky test.\n---\n\nSteps.\n",
    });
    const root = await writeTree(tree);
    await touchPlugin(root, "pr-review", days(300));
    await touchPlugin(root, "flaky-triage", days(2));
    await build({ root, now: NOW });

    const index = await readJson(root, "dist/site/index.json");
    expect(index.recentlyAdded).toEqual(["flaky-triage"]);
  });

  it("renders a page per plugin and groups the homepage by role", async () => {
    const root = await writeTree(
      validTree({
        CODEOWNERS: codeownersFor("pr-review", "story-splitter"),
        "plugins/story-splitter/plugin.yaml": pluginYaml({
          name: "story-splitter",
          description: "Splits epics into stories.",
          roles: ["Business Analyst", "Product Owner"],
        }),
        "plugins/story-splitter/README.md": "# Story splitter\n",
        "plugins/story-splitter/skills/split-story/SKILL.md":
          "---\nname: split-story\ndescription: Split an epic.\n---\n\nSteps.\n",
      }),
    );
    await build({ root, now: NOW });

    const home = await read(root, "dist/site/index.html");
    expect(home).toContain("Business Analyst");
    expect(home).toContain("Product Owner");
    // A multi-role plugin appears under each of its roles.
    expect(home.split("story-splitter").length - 1).toBeGreaterThanOrEqual(2);

    // Role filtering is a control, not just something you can type into search.
    for (const role of ["Developer", "QA", "Business Analyst", "Product Owner"]) {
      expect(home).toContain(`data-role-filter="${role}"`);
    }
    expect(home).not.toContain('data-role-filter="Scrum Master"');

    const page = await read(root, "dist/site/plugins/pr-review.html");
    expect(page).toContain("<strong>checklist</strong>");
    expect(page).toContain("/plugin install pr-review@agent-hub");
  });

  it("refuses to emit anything when the tree is invalid", async () => {
    const root = await writeTree(validTree({ "plugins/pr-review/plugin.yaml": pluginYaml({ version: "one" }) }));
    const result = await build({ root, now: NOW });

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("schema");
    await expect(readJson(root, "plugins/pr-review/plugin.json")).rejects.toThrow();
  });
});

describe("catalog shell", () => {
  it("self-hosts the display, body and mono faces", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });

    const styles = await read(root, "dist/site/styles.css");
    expect(styles).toContain("@font-face");
    expect(styles).toContain("./fonts/archivo-narrow.woff2");
    expect(styles).toContain("./fonts/geist.woff2");
    expect(styles).toContain("./fonts/geist-mono.woff2");
    expect(styles).toContain("font-display: swap");
    // No third-party font host: the catalog sits behind org access control.
    expect(styles).not.toContain("fonts.googleapis.com");

    for (const file of ["archivo-narrow.woff2", "geist.woff2", "geist-mono.woff2"]) {
      const bytes = await readFile(join(root, "dist/site/fonts", file));
      expect(bytes.length).toBeGreaterThan(1000);
      expect(bytes.subarray(0, 4).toString("latin1")).toBe("wOF2");
    }
    // Only the display face is preloaded.
    expect(await read(root, "dist/site/index.html")).toContain('rel="preload"');
  });

  it("filters by role from a rail, with a labelled control on small screens", async () => {
    const root = await writeTree(
      validTree({
        CODEOWNERS: codeownersFor("pr-review", "story-splitter"),
        "plugins/story-splitter/plugin.yaml": pluginYaml({
          name: "story-splitter",
          description: "Splits epics into stories.",
          roles: ["Business Analyst"],
        }),
        "plugins/story-splitter/README.md": "# Story splitter\n",
        "plugins/story-splitter/skills/split-story/SKILL.md":
          "---\nname: split-story\ndescription: Split an epic.\n---\n\nSteps.\n",
      }),
    );
    await build({ root, now: NOW });
    const home = await read(root, "dist/site/index.html");

    expect(home).toContain('class="rail"');
    // Real icons from one library, not hand-drawn paths.
    expect(home).toContain("<svg");
    for (const role of ["Developer", "QA", "Business Analyst"]) {
      expect(home).toContain(`data-role-filter="${role}"`);
      expect(home).toContain(`<option value="${role}">`);
    }
    expect(home).toContain('aria-pressed="false"');
    // Sections are role-owned, so picking a role can put the others away.
    expect(home).toContain('data-role="Business Analyst"');
    expect(home).toContain("Filter by role");
  });

  it("gives the plugin page one tab per tool instead of four stacked blocks", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/plugins/pr-review.html");

    for (const tool of ["Claude Code", "GitHub Copilot", "OpenAI Codex", "Universal"]) {
      expect(page).toContain(`data-tab="${tool}"`);
    }
    expect(page).toContain("/plugin install pr-review@agent-hub");
    expect(page).toContain("install.sh");
    expect(page).toContain("Copy");
  });
});

describe("contribute page", () => {
  const guide = "# Contributing a plugin\n\nOne directory under `plugins/`.\n\n## The portable subset\n\nSkills and mcp.json only.\n";

  it("publishes the contributor guide on the site so the path has a destination", async () => {
    const root = await writeTree(validTree({ "CONTRIBUTING.md": guide }));
    await build({ root, now: NOW });

    const page = await read(root, "dist/site/contribute.html");
    expect(page).toContain("Contributing a plugin");
    expect(page).toContain("The portable subset");
    expect(page).toContain("<code>plugins/</code>");
    expect(page.match(/<h1/g)).toHaveLength(1);

    const home = await read(root, "dist/site/index.html");
    expect(home).toContain('href="./contribute.html"');
    expect(home).not.toContain("blob/main/CONTRIBUTING.md");
  });

  it("still gives the path a page when the repo has no guide file", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });

    // The nav links here from every page, so it must never 404.
    const page = await read(root, "dist/site/contribute.html");
    expect(page).toContain("Contribute a skill");
    expect(page).toContain("github.com/acme/agent-hub");
    expect(page).toContain("no <code>CONTRIBUTING.md</code> yet");
  });

  it("frames every detail page with the same well and gutter", async () => {
    const root = await writeTree(validTree({ "CONTRIBUTING.md": "# Guide\n\nText.\n" }));
    await build({ root, now: NOW });

    // Detail pages are not <section>, so the frame has to come from .detail.
    expect(await read(root, "dist/site/styles.css")).toContain(
      ".detail { max-width: 68rem; margin: 0 auto; padding: clamp(2.5rem, 5vw, 4rem) var(--gutter); }",
    );
    for (const file of ["request.html", "contribute.html", "plugins/pr-review.html"]) {
      expect(await read(root, `dist/site/${file}`)).toContain('<article class="detail">');
    }
  });

  it("links the contribute path from every page's navigation", async () => {
    const root = await writeTree(validTree({ "CONTRIBUTING.md": "# Guide\n\nText.\n" }));
    await build({ root, now: NOW });

    for (const file of ["index.html", "request.html", "contribute.html", "plugins/pr-review.html"]) {
      expect(await read(root, `dist/site/${file}`)).toContain("contribute.html");
    }
  });
});

describe("accessibility contracts", () => {
  it("keeps one top-level heading per plugin page by demoting the README", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/plugins/pr-review.html");

    expect(page.match(/<h1/g)).toHaveLength(1);
    // The README's own "# PR Review" becomes an h2 under the page's heading.
    expect(page).toContain("<h2>PR Review</h2>");
    expect(page).not.toContain("<h1>PR Review</h1>");
  });

  it("wires the install tabs to their panels", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/plugins/pr-review.html");

    expect(page).toContain('aria-controls="panel-claude-code"');
    expect(page).toContain('id="panel-claude-code"');
    expect(page).toContain('role="tabpanel"');
    expect(page).toContain('aria-labelledby="tab-claude-code"');
    // One tab stop for the strip, so the arrow keys own movement within it.
    expect(page).toContain('tabindex="-1"');
    expect(page).toContain("ArrowRight");
  });

  it("announces catalog filtering and offers a skip link", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const home = await read(root, "dist/site/index.html");

    expect(home).toContain('id="no-results"');
    expect(home).toContain('role="status"');
    expect(home).toContain('class="skip"');
    expect(home).toContain('href="#main"');
    expect(home).toContain('id="main"');
    expect(home).toContain('<meta name="description"');
    expect(home).toContain('rel="icon"');
  });

  it("ties the request form's help text to its fields", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/request.html");

    expect(page).toContain('aria-describedby="scenarios-hint"');
    expect(page).toContain('id="scenarios-hint"');
  });
});

describe("request page", () => {
  it("hands the answers to GitHub's own form instead of asking for a token", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/request.html");

    // The page has no backend and now asks for no credential: GitHub's own
    // session authenticates the requester on GitHub's own form.
    expect(page).not.toContain("api.github.com");
    expect(page).not.toContain("Authorization");
    expect(page).not.toContain('name="token"');

    expect(page).toContain('REPO = "acme/agent-hub"');
    expect(page).toContain('TEMPLATE = "skill-request.yml"');
    expect(page).toContain('"https://github.com/" + REPO + "/issues/new?"');
    // The prefill parameters come from the build's own table rather than being
    // retyped here, so they cannot drift from the template's field ids.
    expect(page).toContain('"param":"skill-title"');
    expect(page).toContain('"param":"scenarios"');
    // Every role in the taxonomy is offered, as on the catalog.
    for (const role of ["Developer", "QA", "Business Analyst", "Scrum Master", "UX Designer", "General"]) {
      expect(page).toContain(`value="${role}"`);
    }
  });

  it("warns about an existing skill with the same ranker the request bot runs", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/request.html");

    // Embedded, not reimplemented: a hint here and a "possible duplicate" label
    // minutes later must never disagree.
    expect(page).toContain(rankSimilar.toString());
    expect(page).toContain("Reviews pull requests against the team checklist.");
    expect(page).toContain("/plugin install pr-review@agent-hub");
    expect(page).toContain("var FLOOR = 0.3");
    // Advisory only: the request still goes through.
    expect(page).toContain("Continue anyway");
  });

  // Open requests are not in the catalog, and with no token the page cannot read
  // them, so it must point at them rather than imply the list is complete.
  it("points at open requests it cannot read instead of ignoring them", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/request.html");

    expect(page).toContain("OPEN_REQUESTS");
    expect(page).toContain("label%3Askill-request");
    expect(page).toContain("Requests still waiting on triage are not in this list.");
  });

  it("carries long scenarios on the clipboard rather than blowing the URL limit", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/request.html");

    expect(page).toContain("URL_BUDGET = 6000");
    expect(page).toContain("url.length > URL_BUDGET");
    expect(page).toContain("handOverLongScenarios");
    expect(page).toContain('issueUrl(answer, "scenarios")');
    // navigator.clipboard is absent on insecure origins, so the page must say
    // what to do rather than throwing.
    expect(page).toContain("navigator.clipboard.writeText");
    expect(page).toContain("catch (error)");
  });

  it("still validates scenario format before handing off", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/request.html");

    expect(page).toContain("Pick at least one role.");
    expect(page).toContain("scenario\\s*:");
    expect(page).toContain("expected\\s*:");
  });
});
