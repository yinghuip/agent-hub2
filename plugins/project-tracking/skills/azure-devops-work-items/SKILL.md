---
name: azure-devops-work-items
description: Break down an Azure DevOps story or backlog item into child task work items, assigning story points and effort from the parent's story points. Use when asked to split a story into tasks, assign effort, or set story points in Azure DevOps.
---

# Azure DevOps work items

Given a parent work item (a User Story, Product Backlog Item, or Bug) that
already has story points, create child task work items and assign each one an
effort derived from the parent's story points.

## 1. Read the parent's story points

```bash
az boards work-item show --id <parent-id> \
  --org <organization-url> --project <project>
```

Take the value of `Microsoft.VSTS.Scheduling.StoryPoints`. If it is missing or
zero, stop and ask for the story point value — never invent it.

## 2. Map story points to child effort

Derive each child task's effort from the parent's story points:

| Parent story points | Child task effort |
| ------------------- | ----------------- |
| 1                   | 1                 |
| 2                   | 4                 |

Default rule: square the story points (1 → 1, 2 → 4). If the team uses a
different baseline, edit this table first and follow it.

## 3. Create the child task and assign effort

```bash
az boards work-item create --type Task \
  --title "<parent title> — <task summary>" \
  --org <organization-url> --project <project>
```

Then set the effort on the new child work item:

```bash
az boards work-item update --id <child-id> \
  --fields "Microsoft.VSTS.Scheduling.Effort=<effort>" \
  --org <organization-url> --project <project>
```

If the project uses the Scrum process, the field is
`Microsoft.VSTS.Scheduling.RemainingWork` instead of `Microsoft.VSTS.Scheduling.Effort`.

## 4. Link the child to the parent

```bash
az boards work-item relation add --id <parent-id> \
  --relation-type child --target-id <child-id> \
  --org <organization-url> --project <project>
```

## 5. Report

List each child task you created with its id, title and effort, and the parent
story points that drove it. Say plainly when no child tasks were created.
