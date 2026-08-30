# PR review checklist

Walks a pull request against the checklist the team agreed on, so reviews stay
consistent whoever picks them up.

## What it does

- Reads the diff and groups changes by area (UI, API, data, config).
- Applies only the checklist items that actually apply to the diff.
- Reports findings as a short list, each anchored to a file and line.

## What it does not do

- It does not approve or merge anything; the human reviewer still decides.
- It does not run your test suite. Run that yourself.
