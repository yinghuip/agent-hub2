import { relative } from "node:path";
import { build, validate } from "./build.ts";
import { parseSkillRequest } from "./request.ts";
import type { ValidationError } from "./types.ts";

const USAGE = `agent-hub — build and validate the skills marketplace

Usage:
  agent-hub build [--root <dir>]      Generate manifests, marketplace files and the catalog site
  agent-hub validate [--root <dir>]   Run the CI gate: every rule, plus a manifest drift check
  agent-hub parse-request [--file <path>]
                                      Parse a skill-request issue body into JSON on stdout
`;

function report(errors: ValidationError[]): void {
  for (const error of errors) {
    const where = error.path ?? error.plugin ?? "repo";
    console.error(`  ✗ [${error.code}] ${where}: ${error.message}`);
  }
  console.error(`\n${errors.length} problem(s) found.`);
}

function flag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? undefined : argv[index + 1];
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(argv: string[]): Promise<number> {
  const [command = "help"] = argv;
  const root = flag(argv, "root") ?? process.cwd();

  if (command === "build") {
    const result = await build({ root });
    if (!result.ok) {
      console.error("Build failed — nothing was written.\n");
      report(result.errors);
      return 1;
    }
    console.log(`Generated ${result.written.length} files:`);
    for (const path of result.written) console.log(`  ${path}`);
    return 0;
  }

  if (command === "validate") {
    const result = await validate({ root });
    if (!result.ok) {
      console.error("Validation failed.\n");
      report(result.errors);
      return 1;
    }
    console.log(`${relative(process.cwd(), root) || "."} is valid.`);
    return 0;
  }

  if (command === "parse-request") {
    const file = flag(argv, "file");
    const body = file ? await (await import("node:fs/promises")).readFile(file, "utf8") : await readStdin();
    const result = parseSkillRequest(body);
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }

  console.log(USAGE);
  return command === "help" || command === "--help" ? 0 : 1;
}
