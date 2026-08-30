/** The fixed scrum-team role taxonomy. Order is the catalog's display order. */
export const ROLES = [
  "Developer",
  "QA",
  "Business Analyst",
  "Product Owner",
  "Scrum Master",
  "UX Designer",
  "General",
] as const;

export type Role = (typeof ROLES)[number];
