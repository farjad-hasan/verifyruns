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
      checks: "allowance to be confirmed",
      history: "90 days",
      connectors: ["HTTP / JSON", "Airtable", "Postgres"],
      channels: ["Slack", "Discord", "Email"],
      extras: ["Heartbeats", "Minimum claimed-count checks"],
    },
    for: "Operators running revenue-touching syncs — orders, invoices, CRM.",
  },
  {
    id: "agency",
    name: "Agency",
    planned_price: "$79–99 / month",
    limits: {
      checks: "allowance to be confirmed",
      history: "90 days",
      connectors: ["all"],
      channels: ["all"],
      extras: ["Package scope to be confirmed with pilot users"],
    },
    for: "A proposed package for consultants maintaining several client workflows. Agency management is not available today.",
  },
] as const;

export const PLAN_IDS = ["free", "pro", "agency"] as const;
