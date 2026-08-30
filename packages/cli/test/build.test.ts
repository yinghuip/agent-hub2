import { readFile, readdir, utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build, renderRequestIssue } from "../src/index.ts";
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

describe("request page", () => {
  it("creates the issue through the GitHub API under the requester's own token", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/request.html");

    expect(page).toContain('"https://api.github.com/repos/" + REPO + "/issues"');
    expect(page).toContain('REPO = "acme/agent-hub"');
    expect(page).toContain("Authorization");
    expect(page).toContain('"skill-request"');
    // The page embeds the build's own renderer rather than reimplementing it,
    // so what the browser posts is exactly what the parser round-trip covers.
    expect(page).toContain(renderRequestIssue.toString());
    expect(page).toContain("Example scenarios and expected results");
    // Every role in the taxonomy is offered, as on the catalog.
    for (const role of ["Developer", "QA", "Business Analyst", "Scrum Master", "UX Designer", "General"]) {
      expect(page).toContain(`value="${role}"`);
    }
  });

  it("explains auth and access failures, and offers a no-token fallback", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    const page = await read(root, "dist/site/request.html");

    expect(page).toContain("401");
    expect(page).toContain("403");
    expect(page).toContain("404");
    expect(page).toContain("issues/new?");
    // The fallback carries the typed answers over to GitHub's own form.
    expect(page).toContain('"skill-title": answer.title');
  });
});
