---
name: review-pr
description: Review a pull request against the team checklist for tests, accessibility and rollback safety. Use when asked to review a PR, a diff, or changes on a branch.
---

# Review a pull request

## 1. Get the diff

Prefer the smallest diff that covers the change: `git diff <merge-base>...HEAD`.
For a GitHub PR, `gh pr diff <number>` is equivalent.

## 2. Group the changes

Sort every changed file into one or more areas: **UI**, **API**, **data**,
**config**. Only the checklist sections for the areas present apply.

## 3. Apply the checklist

**Always**

- Does each behavioural change have a test that fails without it?
- Is anything here irreversible on deploy (a destructive migration, a deleted column)?

**UI**

- Do new interactive elements have accessible names and keyboard access?
- Does the change hold up at narrow widths and in dark mode?

**API**

- Is the change backwards compatible for existing callers, or versioned?
- Are new inputs validated at the boundary?

**Data**

- Is the migration reversible, and is the rollback written down?
- Does it backfill in batches rather than one long-running statement?

**Config**

- Does a new setting have a safe default for every environment?
- Are secrets referenced rather than inlined?

## 4. Report

List findings most-serious first, each as `path:line — what is wrong — what to do`.
Say plainly when a section had no findings; do not invent them to fill the list.
