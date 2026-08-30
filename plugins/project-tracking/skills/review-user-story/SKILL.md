---
name: review-user-story
description: Review a user story against the INVEST framework and Definition of Ready, producing a scored matrix and a ready/not-ready verdict. Use when asked to review, analyse or refine a user story, backlog item or Azure DevOps work item before sprint planning.
---

# Review a user story

Score a user story against the INVEST framework, then judge whether it meets
Definition of Ready. The output is a matrix table with a score per criterion, the
average, and a verdict.

## 1. Get the story

The story can arrive as pasted text or as a link to a work item.

- **Pasted text**: use the title, description and acceptance criteria as given.
- **Azure DevOps link** (e.g. `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}`):
  try `az boards work-item show --id {id} --org {org} --project {project}` if the
  Azure CLI is available and authenticated. If it is not, ask the user to paste the
  work item's title, description and acceptance criteria.
- For any other tracker link, ask the user to paste the story text.

If the story text is missing or empty, stop and ask for it — never invent one.

## 2. Score each INVEST criterion

Score every criterion from **1 to 5** and record a one-line reason per score.

| Criterion | Question it answers | Scores low (1–2) when… |
| --- | --- | --- |
| **Independent** | Can this be built without waiting on another story? | It has hard ordering dependencies on other stories. |
| **Negotiable** | Are the details a starting point, not a contract? | It reads as a fixed spec with no room to adjust. |
| **Valuable** | Does it deliver clear value to a user or customer? | The value is vague, internal-only, or unstated. |
| **Estimable** | Can the team size it with confidence? | Scope is too vague to estimate. |
| **Small** | Does it fit inside one iteration? | It bundles several features or a whole epic. |
| **Testable** | Can acceptance criteria be verified? | Criteria are missing, subjective, or cannot be checked. |

Score 5 when the criterion is fully met, 3 when it is partially met, 1 when it is
clearly not met. Justify every score from the story text.

## 3. Check Definition of Ready

A story is ready only when **all** of these hold:

- There is a description that states who and what and why.
- Acceptance criteria exist and are specific and testable.
- The story is small enough to complete in one iteration.
- The team can estimate it.
- There are no unresolved external dependencies.

## 4. Report

Produce a matrix table like this, one row per criterion:

```
| Criterion   | Score | Why |
| Independent | 4     | …   |
| Negotiable  | 5     | …   |
| Valuable    | 5     | …   |
| Estimable   | 2     | …   |
| Small       | 1     | …   |
| Testable    | 1     | …   |
```

Then state the **average score** as a number, and the **Definition of Ready
verdict**. The story is **not ready** when its average INVEST score is below 4,
or when any Definition of Ready check fails. When it is not ready, list the
failing criteria and what to fix before bringing the story into a sprint.
