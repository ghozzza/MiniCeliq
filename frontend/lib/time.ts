// Small, dependency-free date helpers for the news feed.
//
// NewsItem.publishedAt is an ISO 8601 string. We render an absolute, readable
// timestamp (e.g. "Jun 22, 2026 · 14:30") for the summary sheet and a compact
// relative label (e.g. "3h ago") for the feed rows.

// "Jun 22, 2026 · 14:30" — absolute, 24h clock, no seconds.
export function formatPublished(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}`;
}

// "just now" / "3h ago" / "2d ago" — compact relative label for list rows.
// Falls back to the short date for anything older than ~7 days.
export function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
