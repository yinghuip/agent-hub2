# Review user story

Scores a user story against the INVEST framework and judges whether it is ready
to be pulled into a sprint, so backlog refinement is consistent whoever runs it.

## What it does

- Reads a user story's description and acceptance criteria, from pasted text or
  an Azure DevOps work item link.
- Scores each INVEST criterion (Independent, Negotiable, Valuable, Estimable,
  Small, Testable) on a 1–5 scale with a one-line justification.
- Reports the average score in a matrix table and a Definition of Ready verdict.

## What it does not do

- It does not rewrite the story for you. It says what is weak and what to fix.
- It does not fetch a work item behind authentication it does not have. When a
  link cannot be reached, it asks for the story text instead of stalling.
