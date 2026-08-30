import { describe, expect, it } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { build, validate } from "../src/index.ts";
import { CODEOWNERS, pluginYaml, validTree, writeTree } from "./helpers.ts";

const NOW = new Date("2025-06-01T00:00:00Z");
const codes = async (tree: Record<string, string>) =>
  (await validate({ root: await writeTree(tree), now: NOW })).errors.map((e) => e.code);

describe("validate", () => {
  it("passes a well-formed tree once its manifests are generated", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });

    const result = await validate({ root, now: NOW });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects metadata that breaks the canonical schema", async () => {
    expect(await codes(validTree({ "plugins/pr-review/plugin.yaml": pluginYaml({ version: "1.0" }) }))).toContain(
      "schema",
    );
    expect(await codes(validTree({ "plugins/pr-review/plugin.yaml": pluginYaml({ description: "" }) }))).toContain(
      "schema",
    );
    expect(await codes(validTree({ "plugins/pr-review/plugin.yaml": pluginYaml({ roles: [] }) }))).toContain("schema");
  });

  it("rejects roles outside the fixed taxonomy", async () => {
    const errors = (
      await validate({
        root: await writeTree(validTree({ "plugins/pr-review/plugin.yaml": pluginYaml({ roles: ["Developer", "DevOps"] }) })),
        now: NOW,
      })
    ).errors;
    expect(errors.map((e) => e.code)).toContain("schema");
    expect(errors.map((e) => e.message).join(" ")).toContain("DevOps");
  });

  it("requires the plugin name to be lowercase-hyphen and to match its directory", async () => {
    expect(await codes(validTree({ "plugins/pr-review/plugin.yaml": pluginYaml({ name: "PR Review" }) }))).toContain(
      "schema",
    );
    expect(await codes(validTree({ "plugins/pr-review/plugin.yaml": pluginYaml({ name: "other-name" }) }))).toContain(
      "name-mismatch",
    );
  });

  it("rejects two plugins claiming the same name", async () => {
    const tree = validTree({
      "plugins/copy/plugin.yaml": pluginYaml({ name: "copy" }),
      "plugins/copy/README.md": "# copy\n",
      "plugins/copy/skills/review-pr/SKILL.md": "---\nname: review-pr\ndescription: Dup.\n---\n\nSteps.\n",
    });
    // Same declared name in a second directory.
    const root = await writeTree({ ...tree, "plugins/copy/plugin.yaml": pluginYaml({ name: "copy" }) });
    await writeFile(join(root, "plugins/copy/plugin.yaml"), pluginYaml({ name: "pr-review" }), "utf8");
    const result = await validate({ root, now: NOW });
    expect(result.errors.map((e) => e.code)).toContain("name-unique");
  });

  it("rejects Claude-only features that break the portable-subset promise", async () => {
    for (const path of ["hooks/hooks.json", "commands/review.md", "agents/reviewer.md"]) {
      const errors = (
        await validate({ root: await writeTree(validTree({ [`plugins/pr-review/${path}`]: "{}" })), now: NOW })
      ).errors;
      expect(errors.map((e) => e.code)).toContain("portable-subset");
      expect(errors.map((e) => e.message).join(" ")).toContain(path.split("/")[0]!);
    }
  });

  it("accepts mcp.json, which is part of the portable subset", async () => {
    const root = await writeTree(
      validTree({ "plugins/pr-review/mcp.json": JSON.stringify({ mcpServers: {} }) }),
    );
    await build({ root, now: NOW });
    expect((await validate({ root, now: NOW })).errors).toEqual([]);
  });

  it("checks SKILL.md frontmatter", async () => {
    expect(
      await codes(validTree({ "plugins/pr-review/skills/review-pr/SKILL.md": "# No frontmatter\n" })),
    ).toContain("skill-frontmatter");
    expect(
      await codes(
        validTree({ "plugins/pr-review/skills/review-pr/SKILL.md": "---\nname: review-pr\n---\n\nBody.\n" }),
      ),
    ).toContain("skill-frontmatter");
    expect(
      await codes(
        validTree({
          "plugins/pr-review/skills/review-pr/SKILL.md": "---\nname: wrong\ndescription: X.\n---\n\nBody.\n",
        }),
      ),
    ).toContain("skill-frontmatter");
  });

  it("requires at least one skill and a README", async () => {
    const noSkill = validTree();
    delete noSkill["plugins/pr-review/skills/review-pr/SKILL.md"];
    expect(await codes(noSkill)).toContain("no-skills");

    const noReadme = validTree();
    delete noReadme["plugins/pr-review/README.md"];
    expect(await codes(noReadme)).toContain("readme");
  });

  it("requires a CODEOWNERS entry per plugin", async () => {
    expect(await codes(validTree({ CODEOWNERS: "/packages/ @acme/platform\n" }))).toContain("codeowners");
  });

  it("flags likely secrets committed inside a plugin", async () => {
    expect(
      await codes(
        validTree({
          "plugins/pr-review/skills/review-pr/SKILL.md":
            "---\nname: review-pr\ndescription: X.\n---\n\ntoken: ghp_0123456789abcdefghijklmnopqrstuvwxyz\n",
        }),
      ),
    ).toContain("secret");
  });

  it("fails when a generated manifest has drifted from the canonical metadata", async () => {
    const root = await writeTree(validTree());
    await build({ root, now: NOW });
    await writeFile(
      join(root, "plugins/pr-review/plugin.json"),
      JSON.stringify({ name: "pr-review", version: "9.9.9" }),
      "utf8",
    );

    const result = await validate({ root, now: NOW });
    expect(result.errors.map((e) => e.code)).toContain("manifest-drift");
    expect(result.errors[0]!.message).toContain("agent-hub build");
  });

  it("fails when a manifest was never generated at all", async () => {
    const root = await writeTree(validTree());
    await mkdir(join(root, "dist"), { recursive: true });
    expect((await validate({ root, now: NOW })).errors.map((e) => e.code)).toContain("manifest-drift");
  });

  it("accepts an engine pointed at a non-Anthropic endpoint", async () => {
    const config = JSON.parse(validTree()["agent-hub.config.json"]!);
    const root = await writeTree(
      validTree({
        "agent-hub.config.json": JSON.stringify({
          ...config,
          engine: {
            id: "deepseek",
            baseUrl: "https://api.deepseek.com/anthropic",
            model: "deepseek-v4-pro",
            subagentModel: "deepseek-v4-flash",
          },
        }),
      }),
    );
    await build({ root, now: NOW });
    expect((await validate({ root, now: NOW })).errors).toEqual([]);
  });

  it("rejects an engine the generation workflow could not act on", async () => {
    const config = JSON.parse(validTree()["agent-hub.config.json"]!);
    const withEngine = (engine: unknown) =>
      validTree({ "agent-hub.config.json": JSON.stringify({ ...config, engine }) });

    expect(await codes(withEngine({ id: "deepseek", baseUrl: "api.deepseek.com" }))).toContain("config");
    expect(await codes(withEngine({ id: "" }))).toContain("config");
    // A key in the config is a key in git; it belongs in the AGENT_API_KEY secret.
    expect(await codes(withEngine({ id: "deepseek", apiKey: "sk-live-not-here" }))).toContain("config");
  });

  it("reports every plugin's problems, not just the first", async () => {
    const root = await writeTree({
      "agent-hub.config.json": validTree()["agent-hub.config.json"]!,
      CODEOWNERS,
      "plugins/pr-review/plugin.yaml": pluginYaml({ version: "nope" }),
      "plugins/pr-review/README.md": "# x\n",
      "plugins/pr-review/skills/review-pr/SKILL.md": "# no frontmatter\n",
    });
    const result = await validate({ root, now: NOW });
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.every((e) => e.plugin === "pr-review")).toBe(true);
  });
});
