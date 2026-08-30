#!/usr/bin/env bash
# Universal installer: copies one Agent Hub plugin's skills into a tool's skills
# directory. The guaranteed fallback when a tool's native marketplace path is
# unavailable or broken.
#
#   curl -fsSL <raw-url>/scripts/install.sh | bash -s -- <plugin> [--tool claude|copilot|codex] [--dest <dir>]
set -euo pipefail

REPO="${AGENT_HUB_REPO:-yinghuip/agent-hub2}"
PLUGIN=""
TOOL="claude"
DEST=""

while [ $# -gt 0 ]; do
  case "$1" in
    --tool) TOOL="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) PLUGIN="$1"; shift ;;
  esac
done

[ -n "$PLUGIN" ] || { echo "usage: install.sh <plugin> [--tool claude|copilot|codex] [--dest <dir>]" >&2; exit 2; }

if [ -z "$DEST" ]; then
  case "$TOOL" in
    claude) DEST="$HOME/.claude/skills" ;;
    copilot) DEST="$HOME/.copilot/skills" ;;
    codex) DEST="$HOME/.codex/skills" ;;
    *) echo "unknown tool: $TOOL (expected claude, copilot or codex)" >&2; exit 2 ;;
  esac
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Fetching $PLUGIN from $REPO…"
git clone --depth 1 --filter=blob:none --sparse "https://github.com/$REPO.git" "$WORK/repo" >/dev/null 2>&1
git -C "$WORK/repo" sparse-checkout set "plugins/$PLUGIN" >/dev/null

SRC="$WORK/repo/plugins/$PLUGIN/skills"
[ -d "$SRC" ] || { echo "plugin '$PLUGIN' not found in $REPO" >&2; exit 1; }

mkdir -p "$DEST"
for skill in "$SRC"/*/; do
  name="$(basename "$skill")"
  rm -rf "${DEST:?}/$name"
  cp -R "$skill" "$DEST/$name"
  echo "  installed $name -> $DEST/$name"
done

if [ -f "$WORK/repo/plugins/$PLUGIN/mcp.json" ]; then
  echo "  note: $PLUGIN ships an mcp.json — register its servers with your tool to get the full skill."
fi
echo "Done. Restart $TOOL to pick up the new skills."
