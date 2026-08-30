---
name: review-user-story
description: Review a user story's description and acceptance criteria against the INVEST framework, score each criterion, and judge whether it meets the Definition of Ready. Use when asked to review, score or assess the readiness of a user story, backlog item or work item.
---

# Review a user story

Score a user story against INVEST and say whether it is ready to be pulled into
a sprint. The deliverable is a matrix table with a 1–5 score per criterion, the
average, and a Definition of Ready verdict.

## 1. Get the story

The story may arrive as pasted text, or as a link to a work item.

- **Pasted text** — use it as-is. Split it into the description and the
  acceptance criteria (usually a "Given/When/Then" block or a bullet list under
  an "Acceptance criteria" heading).
- **Azure DevOps link** (`.../_workitems/edit/<id>` or `_workitems?id=<id>`) —
  try to fetch it. With the Azure CLI logged in:
  `az boards work-item show --id <id> --org <org> --project <project>`.
  Otherwise use the REST API:
  `curl -s -u :<PAT> "https://dev.azure.com/<org>/<project>/_apis/wit/workitems/<id>?api-version=7.1"`.
  The `System.Title`, `System.Description` and `Microsoft.VSTS.Common.AcceptanceCriteria`
  fields are the description and acceptance criteria.
- **Link you cannot fetch** (no credentials, unreachable, or a non-Azure
  tracker) — do not stall on it. Ask the user to paste the title, description
  and acceptance criteria, or proceed with whatever text they already pasted
  alongside the link. You can still review without the link resolving.

If the story has no acceptance criteria at all, that is a finding, not a reason
to stop: continue with the description you have.

## 2. Score each INVEST criterion

Score each criterion **1–5** and keep one sentence of justification per score.
Read the story as written — do not give credit for detail that is not there.

| Criterion | What a high score (4–5) looks like | What a low score (1–2) looks like |
| --- | --- | --- |
| **I**ndependent | Deliverable on its own; no blocking dependency on another story or team. | Waits on another story, service, or team to be finished first. |
| **N**egotiable | The *what* is fixed but the *how* is left to the team. | The solution is dictated ("rewrite X", "use Y") with no room to change approach. |
| **V**aluable | The user or business value is stated and obvious. | Value is missing, vague ("improve", "make better") or only implied. |
| **E**stimable | Enough detail for the team to size it with confidence. | Too little information, or so open-ended that any estimate is a guess. |
| **S**mall | Fits inside one sprint; can be done in days, not weeks. | Epic-sized; several stories' worth of work in one item. |
| **T**estable | Acceptance criteria are objective and verifiable. | No acceptance criteria, or criteria that cannot be checked. |

## 3. Compute the average

Average the six scores to one decimal place:
`average = (I + N + V + E + S + T) / 6`.

## 4. Judge the Definition of Ready

The story **meets** the Definition of Ready only when **both** hold:

- the average score is **4.0 or higher**, and
- it has acceptance criteria that are present and testable (a `T` of 4 or more).

Otherwise — including any average **below 4.0** — it does **not** meet the
Definition of Ready. Say so plainly; do not soften a failing verdict.

## 5. Report

Always produce:

1. **The matrix table** — one row per INVEST criterion with its score and the
   one-sentence justification, plus the average row.
2. **The verdict** — "Meets the Definition of Ready" or "Does not meet the
   Definition of Ready", with the reason.
3. **What to fix** — the specific shortfalls that pulled the score down (for
   example: missing acceptance criteria, unclear value, oversized scope), each
   as one concrete, actionable item. If the story passes, say what still makes
   it slightly weaker so the team can improve it further.
