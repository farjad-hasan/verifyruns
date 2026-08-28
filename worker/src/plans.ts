export const PLANS = [
  {
    id: "free",
    name: "Free",
    planned_price: "$0",
    limits: { checks: 3, history: "30 runs", connectors: ["HTTP / JSON", "Airtable"], channels: ["Slack", "Discord"] },
    for: "One or two workflows you can't afford to trust blindly.",
  },
  {
    id: "pro",
    name: "Pro",
    planned_price: "$19–29 / month",
    limits: {
      checks: "unlimited",
      history: "90 days",
      connectors: ["HTTP / JSON", "Airtable", "Postgres"],
      channels: ["Slack", "Discord", "Email"],
      extras: ["Heartbeats", "Claimed-count reconciliation"],
    },
    for: "Operators running revenue-touching syncs — orders, invoices, CRM.",
  },
  {
    id: "agency",
    name: "Agency",
    planned_price: "$79–99 / month",
    limits: {
      checks: "unlimited",
      history: "90 days",
      connectors: ["all"],
      channels: ["all"],
      extras: ["Client grouping", "Branded public status pages", "Priority alerts"],
    },
    for: "Agencies at client #21 who need proof, not promises.",
  },
] as const;

export const PLAN_IDS = ["free", "pro", "agency"] as const;
