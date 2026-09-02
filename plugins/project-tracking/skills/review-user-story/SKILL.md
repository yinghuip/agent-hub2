---
name: review-user-story
description: Review an Azure DevOps user story the way a solution architect would, listing its non-functional and security requirements. Use when asked to review a story or work item for NFRs or security concerns.
---

# Review a user story

Given an Azure DevOps user story (or Product Backlog Item), review it as a
solution architect: pull the non-functional requirements and the security
requirements out of the story and list them plainly.

## 1. Read the work item

```bash
az boards work-item show --id <work-item-id> \
  --org <organization-url> --project <project>
```

Work from the title, description and acceptance criteria. If the description is
empty or the id is missing, ask for the story text — never review a story you
have not read.

## 2. List non-functional requirements

Read the story for the qualities it implies but does not state as features, and
list each as a concrete, testable requirement. Cover, where the story touches
them:

- **Performance** — response time, throughput, concurrency, load.
- **Availability & reliability** — uptime, recovery time, data durability.
- **Scalability** — behaviour as users or data grow.
- **Usability & accessibility** — who can use it, and with what assistive tech.
- **Compatibility** — browsers, devices, operating systems, versions.
- **Observability & operations** — logging, metrics, alerting, backups.
- **Compliance & legal** — retention, residency, records, standards.

For each: name the requirement, point at where in the story it comes from, and
state the measurable bar it must meet. Say plainly when the story is silent on a
category rather than inventing one.

## 3. List security requirements

Review the story for what it exposes and what could go wrong, and list each as a
concrete requirement. Cover:

- **Authentication & authorisation** — who may act, and how that is enforced.
- **Data protection** — encryption at rest and in transit, key handling.
- **Input handling** — validation, injection, uploads.
- **Audit & non-repudiation** — what is logged and who can read it.
- **Secrets & configuration** — no credentials in the story or code.
- **Threats specific to the story** — spoofing, tampering, repudiation,
  information disclosure, denial of service, elevation of privilege (STRIDE).

For each: name the requirement, tie it to the part of the story that creates it,
and state the control that satisfies it.

## 4. Report

Output two clearly separated lists — non-functional requirements, then security
requirements. Mark each requirement as explicit (the story says it), implied
(the story depends on it) or missing (the story is silent and you are flagging
it). End with the gaps that need the product owner's decision, if any.
