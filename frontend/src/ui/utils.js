// Small formatting and classification helpers used by the console UI.

export const formatRs = (n) =>
  "Rs." + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatDateTime = (ts) =>
  new Date(ts).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// "5m ago" for past timestamps, null for future ones (the seed script can post future times)
export function relativeTime(ts) {
  const seconds = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (seconds < 0) return null;
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// 0-49 low (yellow), 50-80 medium (orange), above 80 high (red)
export const riskLevel = (score) => (score > 80 ? "high" : score >= 50 ? "medium" : "low");

// Decide which icon and colour a reason tag gets, from the rule's message text
export function reasonKind(text) {
  const t = text.toLowerCase();
  if (t.startsWith("velocity")) return "velocity";
  if (t.startsWith("unusual amount")) return "amount";
  if (t.startsWith("impossible travel")) return "location";
  if (t.startsWith("possible account takeover")) return "takeover";
  return "generic";
}

// Friendly one-line descriptions for the Active Rules panel (unknown rules just show no blurb)
export const RULE_INFO = {
  velocity: "Too many transactions in 5 minutes",
  unusual_amount: "Amount far above the user's average",
  impossible_location: "Travel faster than a plane could fly",
  account_takeover: "New device plus a change in behaviour",
};

export const prettyRule = (name) => name.replace(/_/g, " ");
