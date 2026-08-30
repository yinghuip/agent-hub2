# OpenCode is an install target served by the universal script, not a manifest

OpenCode discovers Claude-compatible `SKILL.md` skills natively from
`~/.config/opencode/skills/` (and project-level `.opencode/skills/`), so the
portable subset we already ship works in it unmodified. We decided to support
OpenCode the way we support Codex — a `--tool opencode` branch in
`scripts/install.sh` plus an `install.opencode` command in the catalog — rather
than generating a fourth manifest. OpenCode has no marketplace-file concept to
target; inventing one would add a generated file, a drift check, and a schema we
would have to track, in exchange for nothing the script does not already do.

## Consequences

- The catalog's `install` record and the plugin page's tab block grow from four
  entries to five; `index.json` gains an `install.opencode` key per plugin,
  which is additive to the site contract.
- OpenCode's global skills directory is `~/.config/opencode/skills` — an
  XDG-style path, unlike the `~/.<tool>/skills` dotdirs the other tools use.
  The installer encodes that; `--dest` remains the escape hatch.
- If OpenCode later grows a marketplace format worth targeting, that becomes a
  new generated manifest in `generateManifests` (drift-checked for free), not a
  change to this decision.
