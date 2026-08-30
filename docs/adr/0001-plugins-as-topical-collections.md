# Plugins are topical collections of skills, not one-plugin-per-request

Every approved skill request used to produce its own single-skill plugin, which
would have grown the marketplace by one plugin per request forever. We decided
that a plugin is a topical collection of skills: generation upserts each new
skill into the plugin it belongs to (an existing plugin, or a seed collection
declared in `agent-hub.config.json` whose directory is created lazily), and a
new plugin is created only when placing the skill anywhere else would make that
plugin's description dishonest. The generation agent makes the placement call —
against the `find-similar` shortlist and the seed list — and must justify it in
the PR body, because Dice-coefficient scores alone are too crude to pick a home.

## Consequences

- We trade per-skill install granularity for a browsable catalog: installing a
  plugin brings all its skills, and any skill change bumps the whole plugin's
  version (patch for updating a skill, minor for adding one). Splitting a
  plugin later breaks installs, which is what makes this hard to reverse.
- No new "collection" concept exists in the code or glossary — a plugin *is*
  the collection; the change is behavioral (where generation writes), not
  structural.
- `pr-review-checklist`, the only plugin predating this decision, stays as-is
  and is the natural target for future review-related skills.
